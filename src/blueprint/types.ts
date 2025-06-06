// Blueprint types for WordPress Playground
// Based on https://playground.wordpress.net/blueprint-schema.json

export interface Blueprint {
	$schema?: string;
	landingPage?: string;
	preferredVersions?: {
		php?: string;
		wp?: string;
	};
	phpExtensionBundles?: string[];
	features?: {
		networking?: boolean;
	};
	login?:
		| boolean
		| {
				username?: string;
				password?: string;
		  };
	steps?: BlueprintStep[];
	constants?: Record<string, string | number | boolean>;
	plugins?: Array<string | PluginResource>;
	themes?: Array<string | ThemeResource>;
	siteOptions?: Record<string, unknown>;
}

export interface PluginResource {
	resource: "wordpress.org/plugins" | "url" | "vfs";
	slug?: string;
	url?: string;
	path?: string;
}

export interface ThemeResource {
	resource: "wordpress.org/themes" | "url" | "vfs";
	slug?: string;
	url?: string;
	path?: string;
}

export type BlueprintStep =
	| InstallPluginStep
	| ActivatePluginStep
	| InstallThemeStep
	| ActivateThemeStep
	| LoginStep
	| WriteFileStep
	| RunPHPStep
	| SetSiteOptionsStep
	| ImportWxrStep
	| DefineWpConfigConstsStep
	| RunSQLStep
	| CpStep
	| MvStep
	| RmStep
	| MkdirStep
	| UnzipStep;

export interface InstallPluginStep {
	step: "installPlugin";
	pluginZipFile: PluginResource;
	pluginData?: PluginResource;
	options?: {
		activate?: boolean;
	};
}

export interface ActivatePluginStep {
	step: "activatePlugin";
	pluginPath: string;
	pluginName?: string;
}

export interface InstallThemeStep {
	step: "installTheme";
	themeData?: ThemeResource;
	themeZipFile?: FileResource;
	options?: {
		activate?: boolean;
	};
}

export interface ActivateThemeStep {
	step: "activateTheme";
	themeFolderName: string;
}

export interface LoginStep {
	step: "login";
	username?: string;
	password?: string;
}

export interface WriteFileStep {
	step: "writeFile";
	path: string;
	data: string | FileResource;
}

export interface RunPHPStep {
	step: "runPHP";
	code: string;
}

export interface SetSiteOptionsStep {
	step: "setSiteOptions";
	options: Record<string, unknown>;
}

export interface ImportWxrStep {
	step: "importWxr";
	file: FileResource;
}

export interface DefineWpConfigConstsStep {
	step: "defineWpConfigConsts";
	consts: Record<string, string | number | boolean>;
	method?: "rewrite-wp-config" | "define-before-run";
}

export interface RunSQLStep {
	step: "runSQL";
	sql: string | FileResource;
}

export interface CpStep {
	step: "cp";
	fromPath: string;
	toPath: string;
}

export interface MvStep {
	step: "mv";
	fromPath: string;
	toPath: string;
}

export interface RmStep {
	step: "rm";
	path: string;
}

export interface MkdirStep {
	step: "mkdir";
	path: string;
}

export interface UnzipStep {
	step: "unzip";
	zipFile: FileResource;
	extractToPath: string;
}

export interface FileResource {
	resource: "url" | "vfs";
	url?: string;
	path?: string;
}
