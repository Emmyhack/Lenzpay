/**
 * Module resolution shim for Node's built-in test runner, which reads tsconfig
 * for nothing. Handles the two things the app's source relies on:
 *
 *   - the `@/*` path alias
 *   - extensionless imports (`./fx`), which TypeScript allows and ESM doesn't
 *
 * Keeps `npm test` dependency-free.
 */
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = new URL('../', import.meta.url);

function isFile(href) {
  try {
    return statSync(fileURLToPath(href)).isFile();
  } catch {
    return false;
  }
}

/**
 * Try the bare href first, then the extensions TypeScript would have tried.
 * Each candidate must be a *file* — a bare directory match would otherwise
 * shadow its own `index.ts` and fail as an unsupported directory import.
 */
function firstExisting(baseHref) {
  const candidates = [
    baseHref,
    `${baseHref}.ts`,
    `${baseHref}.tsx`,
    `${baseHref}/index.ts`,
    `${baseHref}/index.tsx`,
  ];
  return candidates.find(isFile);
}

export function resolve(specifier, context, nextResolve) {
  const isAlias = specifier.startsWith('@/');
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');

  // Never touch resolution inside dependencies — packages ship their own
  // exports maps, and second-guessing them produces confusing errors.
  const fromDependency = context.parentURL?.includes('/node_modules/');

  if ((!isAlias && !isRelative) || fromDependency) {
    return nextResolve(specifier, context);
  }

  const base = isAlias
    ? new URL(specifier.slice(2), projectRoot)
    : new URL(specifier, context.parentURL);

  const found = firstExisting(base.href);
  // Fall back to the original specifier so a genuine miss surfaces as Node's
  // normal error rather than one about a path this shim invented.
  return found ? nextResolve(found, context) : nextResolve(specifier, context);
}
