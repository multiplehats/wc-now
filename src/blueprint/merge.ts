import type {
	Blueprint,
	BlueprintV1,
	BlueprintV2,
	BlueprintVersion,
} from "./types";

export function detectBlueprintVersion(value: unknown): BlueprintVersion {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Blueprint must be a JSON object");
	}
	if (!("version" in value)) {
		return 1;
	}
	const version = (value as { version?: unknown }).version;
	if (version === 2) {
		return 2;
	}
	throw new Error(`Unsupported Blueprint version: ${JSON.stringify(version)}`);
}

export function resolveBlueprintVersion(
	custom: unknown | undefined,
	requested?: BlueprintVersion,
): BlueprintVersion {
	const detected =
		custom === undefined ? undefined : detectBlueprintVersion(custom);
	if (requested && detected && requested !== detected) {
		throw new Error(
			`Requested Blueprint v${requested} conflicts with custom Blueprint v${detected}`,
		);
	}
	return requested ?? detected ?? 2;
}

export function mergeBlueprints(base: Blueprint, custom: Blueprint): Blueprint {
	const baseVersion = detectBlueprintVersion(base);
	const customVersion = detectBlueprintVersion(custom);
	if (baseVersion !== customVersion) {
		throw new Error(
			`Cannot merge Blueprint v${baseVersion} with Blueprint v${customVersion}`,
		);
	}
	return baseVersion === 2
		? mergeBlueprintsV2(base as BlueprintV2, custom as BlueprintV2)
		: mergeBlueprintsV1(base as BlueprintV1, custom as BlueprintV1);
}

function mergeBlueprintsV1(
	base: BlueprintV1,
	custom: BlueprintV1,
): BlueprintV1 {
	const merged: BlueprintV1 = { ...base, ...custom };

	if (custom.preferredVersions) {
		merged.preferredVersions = {
			...base.preferredVersions,
			...custom.preferredVersions,
		};
	}
	if (custom.phpExtensionBundles) {
		merged.phpExtensionBundles = [
			...(base.phpExtensionBundles ?? []),
			...custom.phpExtensionBundles,
		].filter((value, index, values) => values.indexOf(value) === index);
	}
	if (custom.features) {
		merged.features = { ...base.features, ...custom.features };
	}
	if (custom.plugins) {
		merged.plugins = [...(base.plugins ?? []), ...custom.plugins];
	}
	if (custom.themes) {
		merged.themes = [...(base.themes ?? []), ...custom.themes];
	}
	if (custom.siteOptions) {
		merged.siteOptions = { ...base.siteOptions, ...custom.siteOptions };
	}
	if (custom.constants) {
		merged.constants = { ...base.constants, ...custom.constants };
	}
	if (custom.steps) {
		merged.steps = [...(base.steps ?? []), ...custom.steps];
	}

	return merged;
}

function mergeBlueprintsV2(
	base: BlueprintV2,
	custom: BlueprintV2,
): BlueprintV2 {
	return {
		...base,
		...custom,
		version: 2,
		applicationOptions: custom.applicationOptions
			? {
					"wordpress-playground": {
						...base.applicationOptions?.["wordpress-playground"],
						...custom.applicationOptions["wordpress-playground"],
					},
				}
			: base.applicationOptions,
		siteOptions: custom.siteOptions
			? { ...base.siteOptions, ...custom.siteOptions }
			: base.siteOptions,
		constants: custom.constants
			? { ...base.constants, ...custom.constants }
			: base.constants,
		postTypes: custom.postTypes
			? { ...base.postTypes, ...custom.postTypes }
			: base.postTypes,
		fonts: custom.fonts ? { ...base.fonts, ...custom.fonts } : base.fonts,
		plugins: appendWhenCustom(base.plugins, custom.plugins),
		themes: appendWhenCustom(base.themes, custom.themes),
		muPlugins: appendWhenCustom(base.muPlugins, custom.muPlugins),
		content: appendWhenCustom(base.content, custom.content),
		media: appendWhenCustom(base.media, custom.media),
		users: appendWhenCustom(base.users, custom.users),
		roles: appendWhenCustom(base.roles, custom.roles),
		additionalStepsAfterExecution: appendWhenCustom(
			base.additionalStepsAfterExecution,
			custom.additionalStepsAfterExecution,
		),
	};
}

function appendWhenCustom<T>(
	base: T[] | undefined,
	custom: T[] | undefined,
): T[] | undefined {
	return custom ? [...(base ?? []), ...custom] : base;
}
