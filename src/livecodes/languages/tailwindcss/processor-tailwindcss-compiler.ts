/* eslint-disable no-bitwise */
import { compileInCompiler } from '../../compiler/compile-in-compiler';
import { isBare, replaceStyleImports } from '../../compiler/import-map';
import type { CompilerFunction, Config, Language } from '../../models';
import { modulesService } from '../../services';
import { getLanguageCustomSettings } from '../../utils/utils';
import { tailwindcss3Url, tailwindcssBaseUrl, vendorsBaseUrl } from '../../vendors';
import { lightningcssFeatures } from '../lightningcss/processor-lightningcss-compiler';
import { addCodeInStyleBlocks } from './utils';

declare const self: any;

self.createTailwindcssCompiler = (): CompilerFunction => {
  const pluginsUrl = vendorsBaseUrl + 'tailwindcss/tailwindcss-plugins.js';
  let cachedPlugins: Record<string, any>;

  const officialPlugins = [
    '@tailwindcss/forms',
    '@tailwindcss/typography',
    '@tailwindcss/aspect-ratio',
    '@tailwindcss/line-clamp',
  ];

  const loadPlugins = () => {
    self.importScripts(pluginsUrl);
    cachedPlugins = self.tailwindcssPlugins.plugins;
  };

  const scan = (code: string) => {
    const classes = new Set<string>();
    // https://regexr.com/8bfi6
    const stringsPattern = /((?:`(?:.|\n|\r)+?`)|(?:'.+?')|(?:".+?"))/g;
    const strings = code.match(new RegExp(stringsPattern)) ?? [];
    for (const str of strings) {
      str
        .slice(1, -1) // remove quotes
        .replace(/[\n\r]/g, ' ')
        .split(' ')
        .forEach((c) => {
          c = c.trim();
          if (c === '' || classes.has(c)) return;
          classes.add(c);
        });
    }
    return Array.from(classes);
  };

  const loadStylesheet = async (id: string, base: string) => {
    const fetchFromCDN = (file: string) => {
      const url = tailwindcssBaseUrl + file;
      return fetch(url).then((res) => res.text());
    };

    const load = async () => {
      // Normalize the ID to handle various import formats
      const normalizedId = id.replace(/^\.\//, '').replace(/\.css$/, '');

      if (id === 'tailwindcss' || normalizedId === 'tailwindcss') {
        return {
          base,
          content: await fetchFromCDN('index.css'),
        };
      } else if (
        id === 'tailwindcss/preflight' ||
        id === 'tailwindcss/preflight.css' ||
        id === './preflight.css' ||
        normalizedId === 'tailwindcss/preflight' ||
        normalizedId === 'preflight'
      ) {
        return {
          base,
          content: await fetchFromCDN('preflight.css'),
        };
      } else if (
        id === 'tailwindcss/theme' ||
        id === 'tailwindcss/theme.css' ||
        id === './theme.css' ||
        normalizedId === 'tailwindcss/theme' ||
        normalizedId === 'theme'
      ) {
        return {
          base,
          content: await fetchFromCDN('theme.css'),
        };
      } else if (
        id === 'tailwindcss/utilities' ||
        id === 'tailwindcss/utilities.css' ||
        id === './utilities.css' ||
        normalizedId === 'tailwindcss/utilities' ||
        normalizedId === 'utilities'
      ) {
        return {
          base,
          content: await fetchFromCDN('utilities.css'),
        };
      }

      // If none of the above match, try to fetch as an absolute URL
      // Only fetch if the ID looks like a valid URL
      if (id.startsWith('http://') || id.startsWith('https://')) {
        return {
          base,
          content: await fetch(id)
            .then((res) => res.text())
            .catch(() => ''),
        };
      }

      // For any other case, return empty content to avoid MIME type errors
      console.warn(`[Tailwind CSS] Unknown stylesheet ID: "${id}". Returning empty content.`);
      return {
        base,
        content: '',
      };
    };

    return load();
  };

  const loadModule = async (id: string) => {
    if (officialPlugins.includes(id) && !cachedPlugins) {
      loadPlugins();
    }
    if (cachedPlugins?.[id]) {
      return {
        base: '/',
        module: cachedPlugins[id],
      };
    }
    try {
      const moduleUrl = isBare(id) ? modulesService.getModuleUrl(id) : id;
      const module = await import(moduleUrl);
      return {
        base: '/',
        module: module.default ?? module,
      };
    } catch {
      throw new Error(`Tailwind CSS plugin "${id}" could not be loaded.`);
    }
  };

  const checkVersion = (code: string) => {
    // https://regexr.com/8bfbb
    const directivesPattern = /@tailwind\s+((base)|(components)|(utilities))\s*;?/g;
    if (new RegExp(directivesPattern).exec(code)) return 3;
    return 4;
  };

  const processInLightningCss: typeof compileInCompiler = async (
    code,
    language,
    config,
    options,
  ) => {
    const Features = lightningcssFeatures;
    // https://github.com/tailwindlabs/tailwindcss/blob/515a9bdc5ff77291d6f41cd1d4c22e9d24ea91bc/packages/%40tailwindcss-cli/src/commands/build/index.ts#L439
    const lightningConfig = {
      minify: false,
      sourceMap: false,
      drafts: { customMedia: true },
      nonStandard: { deepSelectorCombinator: true },
      include: Features.Nesting,
      exclude: Features.LogicalProperties | Features.DirSelector | Features.LightDark,
      targets: {
        safari: (16 << 16) | (4 << 8),
        ios_saf: (16 << 16) | (4 << 8),
        firefox: 128 << 16,
        chrome: 111 << 16,
      },
      errorRecovery: true,
    };
    const modifiedConfig: Config = {
      ...config,
      customSettings: {
        ...config.customSettings,
        lightningcss: {
          ...lightningConfig,
          ...config.customSettings.lightningcss,
        },
      },
    };
    // process twice
    // https://github.com/tailwindlabs/tailwindcss/blob/515a9bdc5ff77291d6f41cd1d4c22e9d24ea91bc/packages/%40tailwindcss-cli/src/commands/build/index.ts#L462-L464
    const compiled1 = await compileInCompiler(code, language, modifiedConfig, options);
    const compiled2 = await compileInCompiler(compiled1.code, language, modifiedConfig, options);
    return compiled2;
  };

  const tailwind3: CompilerFunction = (code, { config, options }) => {
    if (!self.createTailwindcss) {
      self.importScripts(tailwindcss3Url);
    }
    const customSettings = getLanguageCustomSettings('tailwindcss', config);
    const selectedPluginNames: string[] =
      customSettings.plugins?.filter((p: string) => officialPlugins.includes(p)) || [];

    if (!cachedPlugins && selectedPluginNames.length > 0) {
      loadPlugins();
    }

    const loadedPlugins = selectedPluginNames.map((p) => cachedPlugins[p]);

    const tailwind = self.createTailwindcss({
      tailwindConfig: {
        ...customSettings,
        ...(loadedPlugins.length > 0 ? { plugins: loadedPlugins } : {}),
      },
    });

    const html = `<template>${options.html}\n<script>${config.script.content}</script></template>`;
    return tailwind.generateStylesFromContent(addCodeInStyleBlocks(code, html), [html]);
  };

  const tailwind4: CompilerFunction = async (code, { config, options }) => {
    const prepareCode = (css: string, html: string) => {
      // First, clean the input CSS of any problematic characters
      let result = css.replace(/```[\s\S]*?```/g, '').replace(/```/g, '');
      result = replaceStyleImports(result, [/tailwindcss/g]);
      if (!result.includes('@import')) {
        result = `@import "tailwindcss";${result}`;
      }
      return addCodeInStyleBlocks(result, html);
    };

    const html = `<template>${options.html}\n<script>${config.script.content}</script></template>`;
    const css = prepareCode(code, html);

    // Additional validation to catch problematic content before compilation
    if (css.includes('```')) {
      console.warn('[Tailwind CSS] CSS contains triple backticks. Removing them to prevent compilation errors.');
      const cleanedCss = css.replace(/```/g, '');
      try {
        const compiler = await self.tailwindcss.compile(cleanedCss, {
          base: '/',
          loadStylesheet,
          loadModule,
        });
        const candidates = scan(html);
        const output: string = compiler.build(candidates);
        return processInLightningCss(output, 'lightningcss' as Language, config, options);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('Error compiling Tailwind CSS after cleaning.', e.message || e);
        return code;
      }
    }

    try {
      const compiler = await self.tailwindcss.compile(css, {
        base: '/',
        loadStylesheet,
        loadModule,
      });
      const candidates = scan(html);
      const output: string = compiler.build(candidates);
      return processInLightningCss(output, 'lightningcss' as Language, config, options);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('Error compiling Tailwind CSS.', e.message || e);
      console.log('[Tailwind CSS] Problematic CSS (first 500 chars):', css.substring(0, 500));
      console.log('[Tailwind CSS] CSS contains backticks:', css.includes('```'));

      // Try one more time with aggressive cleanup
      const ultraCleanCss = css.replace(/`/g, '').replace(/[^\x20-\x7E\n\r\t]/g, '');
      try {
        const compiler = await self.tailwindcss.compile(ultraCleanCss, {
          base: '/',
          loadStylesheet,
          loadModule,
        });
        const candidates = scan(html);
        const output: string = compiler.build(candidates);
        console.log('[Tailwind CSS] Successfully compiled after aggressive cleanup');
        return processInLightningCss(output, 'lightningcss' as Language, config, options);
      } catch (e2: any) {
        console.error('[Tailwind CSS] Failed even after cleanup:', e2.message || e2);
      }
    }
    // Return the cleaned original code as fallback
    return code.replace(/```[\s\S]*?```/g, '').replace(/```/g, '');
  };

  return (cssCode, compileOptions) =>
    checkVersion(cssCode) === 3
      ? tailwind3(cssCode, compileOptions)
      : tailwind4(cssCode, compileOptions);
};
