// Blueprint types for WordPress Playground
// Based on https://playground.wordpress.net/blueprint-schema.json

export interface BlueprintV1 {
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
	steps?: BlueprintV1Step[];
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

export type BlueprintV1Step =
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
	pluginData?: PluginResource;
	pluginZipFile?: FileResource;
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

export type BlueprintVersion = 1 | 2;

export type JsonValue =
	| null
	| string
	| number
	| boolean
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface InlineFileReference {
	filename: string;
	content: string;
}

export type BlueprintV2DataReference = string | InlineFileReference;

export type BlueprintV2Step =
	| {
			step: "runPHP";
			code: BlueprintV2DataReference;
			env?: Record<string, string>;
	  }
	| {
			step: "activatePlugin";
			pluginPath: string;
			humanReadableName?: string;
	  }
	| { step: "setSiteOptions"; options: Record<string, JsonValue> }
	| { step: "mkdir"; path: string }
	| { step: "rm"; path: string }
	| { step: "rmdir"; path: string }
	| { step: "cp"; fromPath: string; toPath: string }
	| { step: "mv"; fromPath: string; toPath: string }
	| {
			step: "writeFiles";
			files: Record<string, BlueprintV2DataReference>;
	  };

export interface BlueprintV2 {
	version: 2;
	$schema?: string;
	blueprintMeta?: Record<string, JsonValue>;
	applicationOptions?: {
		"wordpress-playground": {
			landingPage?: string;
			login?: boolean | { username: string; password: string };
			networkAccess?: boolean;
		};
	};
	siteLanguage?: string;
	siteOptions?: Record<string, JsonValue>;
	constants?: Record<string, string | number | boolean>;
	wordpressVersion?: string | Record<string, JsonValue>;
	phpVersion?: string | Record<string, JsonValue>;
	activeTheme?: BlueprintV2DataReference | Record<string, JsonValue>;
	themes?: Array<BlueprintV2DataReference | Record<string, JsonValue>>;
	plugins?: Array<BlueprintV2DataReference | Record<string, JsonValue>>;
	muPlugins?: BlueprintV2DataReference[];
	content?: Record<string, JsonValue>[];
	media?: Array<BlueprintV2DataReference | Record<string, JsonValue>>;
	users?: Record<string, JsonValue>[];
	roles?: Record<string, JsonValue>[];
	postTypes?: Record<string, JsonValue>;
	fonts?: Record<string, JsonValue>;
	additionalStepsAfterExecution?: BlueprintV2Step[];
}

export type Blueprint = BlueprintV1 | BlueprintV2;

// Backwards-compatible alias for the original v1 step type.
export type BlueprintStep = BlueprintV1Step;
