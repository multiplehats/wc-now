/** Absolute VFS path of the mounted per-instance logs directory. */
export const LOGS_VFS_DIR = "/wordpress/wp-content/logs";
/** Absolute VFS path of the debug.log the logs mount exposes as a host file. */
export const LOGS_VFS_FILE = `${LOGS_VFS_DIR}/debug.log`;
/** REST namespace/route of the loopback exec endpoint. */
export const EXEC_ROUTE = "/wcnow/v1/exec";
/** Header carrying the per-instance exec token. */
export const EXEC_TOKEN_HEADER = "x-wcnow-token";

/**
 * Token-guarded loopback exec mu-plugin.
 *
 * `wc-now exec` runs PHP *inside the live process* by POSTing base64'd code to a
 * REST route this plugin registers. Running in-process keeps state coherent — no
 * second `wp-playground` process and no shared-SQLite concurrency, both of which
 * corrupt under WooCommerce. DEV ONLY: the endpoint is reachable solely on the
 * 127.0.0.1-bound dev server and rejects any request without the random token.
 */
export function execMuPlugin(token: string): string {
	return `<?php
/**
 * Plugin Name: wc-now Exec (mu)
 * Description: Loopback exec endpoint used by \`wc-now exec\`. Runs PHP inside the
 *              live process so state stays coherent. DEV ONLY — token-guarded and
 *              only reachable on the 127.0.0.1-bound dev server.
 */
define( 'WCNOW_EXEC_TOKEN', '${token}' );
add_action( 'rest_api_init', function () {
	register_rest_route( 'wcnow/v1', '/exec', [
		'methods'             => 'POST',
		'permission_callback' => '__return_true',
		'callback'            => function ( $req ) {
			if ( ! hash_equals( WCNOW_EXEC_TOKEN, (string) $req->get_header( '${EXEC_TOKEN_HEADER}' ) ) ) {
				return new WP_Error( 'forbidden', 'bad token', [ 'status' => 403 ] );
			}
			$code = base64_decode( (string) $req->get_param( 'code' ) );
			@set_time_limit( 0 );
			ob_start();
			try { $ret = eval( $code ); }
			catch ( \\Throwable $e ) { $ret = null; echo "\\n[EXEC ERROR] " . $e->getMessage(); }
			return [ 'out' => ob_get_clean(), 'ret' => $ret ];
		},
	] );
} );
`;
}

/**
 * Routes PHP's error_log to the mounted logs directory so `debug.log` is a real
 * host file that `wc-now logs` can tail.
 *
 * The re-assertion on late hooks (not just at include time) is deliberate: the
 * generated WooCommerce blueprint ships a `playground-helpers.php` mu-plugin that
 * points error_log at `WP_CONTENT_DIR/debug.log`, and mounted-directory mu-plugin
 * load order is not reliably alphabetical, so a load-time ini_set can lose. A
 * PHP_INT_MAX-priority hook on `plugins_loaded`/`init` always wins.
 */
export function logsMuPlugin(): string {
	return `<?php
/**
 * Plugin Name: wc-now Logs (mu)
 * Description: Routes error_log to the mounted logs dir so debug.log is a real
 *              host file. Named to sort last; re-asserts on late hooks to beat
 *              any other mu-plugin that repoints error_log.
 */
$wcnow_log = '${LOGS_VFS_FILE}';
@ini_set( 'log_errors', '1' );
@ini_set( 'error_log', $wcnow_log );
foreach ( [ 'muplugins_loaded', 'plugins_loaded', 'init' ] as $wcnow_hook ) {
	add_action( $wcnow_hook, function () use ( $wcnow_log ) {
		@ini_set( 'error_log', $wcnow_log );
	}, PHP_INT_MAX );
}
`;
}
