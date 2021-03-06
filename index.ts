/**
 * Using package name regexp:
 * https://www.npmjs.com/package/package-name-regex
 * Copyright © Sebastian Landwehr info@sebastianlandwehr.com
 */

import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { parallelLimit } from 'async';

type ProcessedPackagesRegistry = { [packageName: string]: true };

const PROCESSED_PACKAGES: ProcessedPackagesRegistry = {};

type CommandResult = {
  stdout: string;
  stderr: string;
};

const sh = (cmd: string) => {
  return new Promise<CommandResult>((resolve, reject) => {
    console.error('[node.js]>', cmd);
    exec(
      cmd,
      {
        maxBuffer: Number(process.env.MAX_BUFFER_FOR_EXEC ?? 5 * 1024 * 1024),
      },
      (err, stdout, stderr) => {
        if (stdout) console.error(`> stdout\n${stdout}< stdout`);
        if (stderr) console.error(`> stderr\n${stderr}< stderr`);

        if (err) {
          return reject(err);
        }

        resolve({ stdout, stderr });
      },
    );
  });
};

type RequireList = { [packageName: string]: string };
type DependencyGraph = { [packageName: string]: Package };

type Package = {
  version: string;
  resolved: string;
  integrity: string;
  dev: boolean;
  requires?: RequireList;
  dependencies?: DependencyGraph;
};

type PackageLockV2 = {
  lockfileVersion: 2;
  packages: {
    '': {
      dependencies?: RequireList;
      devDependencies?: RequireList;
    };
  };
  dependencies: DependencyGraph;
};

type NpmInfo = {
  _id: string;
  _rev: string;
  name: string;
  'dist-tags': { [tag: string]: string };
  versions: string[];
  maintainers: string[];
  time: { [key: string]: string };
  repository: {
    type: string;
    url: string;
    directory: string;
  };
  readmeFilename: string;
  homepage: string;
  keywords: string[];
  bugs: {
    url: string;
  };
  users: { [username: string]: true };
  license: string;
  _cached: boolean;
  _contentLength: number;
  version: string;
};

const getCacheDirectory = () => {
  const homedir = os.homedir();
  const cachedir = path.join(homedir, '.npm-dependency-date');

  if (!fs.existsSync(cachedir)) {
    fs.mkdirSync(cachedir);
  }

  return cachedir;
};

const getNpmInfo = async (packageName: string, requestedVersion: string) => {
  const cachedir = getCacheDirectory();
  const cacheFilePath = path.join(cachedir, `${packageName}.json`);
  do {
    if (process.env.IGNORE_CACHE) {
      break;
    }

    if (!fs.existsSync(cacheFilePath)) {
      break;
    }

    const stat = fs.statSync(cacheFilePath);
    if (Date.now() - stat.mtimeMs > 1000 * 60 * 60 * 24) {
      break;
    }

    const cacheFile = fs.readFileSync(cacheFilePath, 'utf-8');
    const cache: NpmInfo = JSON.parse(cacheFile);

    return cache;
  } while (false); // eslint-disable-line no-constant-condition

  /**
   * I had a problem and I've used regexp to fix it...
   * @link https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
   * @link https://regex101.com/r/esRA7X/1
   */
  const semverRegexp =
    /^(?:\*|x|[~^]?(0|[1-9]\d*)(?:\.(?:\*|x|(0|[1-9]\d*)(?:\.(?:\*|x|(0|[1-9]\d*)))?))?)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  if (!requestedVersion.match(semverRegexp)) {
    throw new Error(
      `Are you getting attacked? ${requestedVersion} doesn't match monstrous semver regexp.`,
    );
  }

  /**
   * It is a really sad day.
   * @link https://github.com/dword-design/package-name-regex/blob/master/src/index.js
   */
  const packageNameRegexp =
    /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  if (!packageName.match(packageNameRegexp)) {
    throw new Error(
      `Are you getting attacked? ${packageName} doesn't match package name regexp.`,
    );
  }

  const infoResult = await sh(
    `npm info --json ${packageName}@${requestedVersion}`,
  );
  const data = JSON.parse(infoResult.stdout);
  const info: NpmInfo = Array.isArray(data) ? data[0] : data;

  const cacheFileBaseDir = path.dirname(cacheFilePath);
  if (!fs.existsSync(cacheFileBaseDir)) {
    fs.mkdirSync(cacheFileBaseDir);
  }

  fs.writeFileSync(cacheFilePath, JSON.stringify(info), 'utf-8');

  return info;
};

type CheckPackageOptions = {
  actualVersion: string;
  date: string;
  packageName: string;
  requestedVersion?: string;
  saveType: 'exact' | 'peer';
};

const checkPackage = async ({
  actualVersion,
  date,
  packageName,
  requestedVersion,
  saveType,
}: CheckPackageOptions) => {
  if (PROCESSED_PACKAGES[packageName]) {
    return;
  }
  PROCESSED_PACKAGES[packageName] = true;

  if (!requestedVersion) {
    requestedVersion = actualVersion;
  }

  let info: NpmInfo;
  try {
    info = await getNpmInfo(packageName, requestedVersion);
  } catch (err) {
    console.error(err);
    console.log(`#! ${packageName}@${requestedVersion}: getNpmInfo failed.`);
    return false;
  }

  const actualVersionTimestamp = info.time[actualVersion];

  if (!actualVersionTimestamp) {
    console.log(`#! ${packageName} has no ${actualVersion} in npm info.`);
    return false;
  }

  console.log(`#  ${packageName}@${actualVersion}: ${actualVersionTimestamp}.`);
  if (actualVersionTimestamp < date) {
    console.log(`#  ${packageName}@${actualVersion}: OK!`);
    return true;
  }

  console.log(`#! ${packageName}@${actualVersion}: downgrade required.`);
  let versions = info.versions;

  if (!process.env.USE_PARTIAL_VERSIONS) {
    versions = versions
      .map((x) => {
        if (x.split('-').length > 1) {
          return '';
        }

        return x;
      })
      .filter(Boolean);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (versions.length == 1) {
      if (info.time[versions[0]!]! > date) {
        console.log(
          `#  ${packageName}@${versions[0]}: package is older than date entirely.`,
        );
        return false;
      }

      console.log(
        `#  ${packageName}@${versions[0]}: ${info.time[versions[0]!]}.`,
      );
      console.log(
        `npm install --save-${saveType} ${packageName}@${versions[0]}`,
      );
      return false;
    }

    const idx = Math.floor(versions.length / 2);
    const target = versions[idx]!;
    if (info.time[target]! > date) {
      versions = versions.slice(0, idx);
    } else {
      versions = versions.slice(idx);
    }
  }
};

const PARALLEL_LIMIT = Number(process.env.PARALLEL_LIMIT) || 8;

const EMPTY = () => {
  /* yes */
};

const walkDirectDependencies = async (
  date: string,
  packageLock: PackageLockV2,
  deps: RequireList,
) => {
  await parallelLimit(
    Object.entries(deps).map(([packageName, requestedVersion]) => {
      const actualVersion = packageLock.dependencies[packageName]?.version;
      if (!actualVersion) {
        console.log(
          `#! package-lock.json is missing .dependecies.${packageName}`,
        );
        return EMPTY;
      }

      return async () =>
        await checkPackage({
          date,
          packageName,
          requestedVersion,
          actualVersion,
          saveType: 'exact',
        });
    }),
    PARALLEL_LIMIT,
  );
};

const processNonDirectDependency = async (
  date: string,
  packageLock: PackageLockV2,
  [packageName, packageData]: [string, Package],
): Promise<void> => {
  await checkPackage({
    date,
    packageName,
    actualVersion: packageData.version,
    saveType: 'peer',
  });

  if (!packageData.dependencies) {
    return;
  }

  await processNonDirectDependencies(
    date,
    packageLock,
    packageData.dependencies,
  );
};

const processNonDirectDependencies = async (
  date: string,
  packageLock: PackageLockV2,
  deps: DependencyGraph,
) => {
  await parallelLimit(
    Object.entries(deps).map(([packageName, packageData]) => {
      if (packageLock.packages[''].dependencies?.[packageName]) {
        return EMPTY;
      }

      if (packageLock.packages[''].devDependencies?.[packageName]) {
        return EMPTY;
      }

      return async () =>
        await processNonDirectDependency(date, packageLock, [
          packageName,
          packageData,
        ]);
    }),
    PARALLEL_LIMIT,
  );
};

const walkNonDirectDependencies = async (
  date: string,
  packageLock: PackageLockV2,
) => {
  return processNonDirectDependencies(
    date,
    packageLock,
    packageLock.dependencies,
  );
};

const main = async () => {
  const dateArg = process.argv[process.argv.length - 1]!;
  console.log(`#  Looking for packages released after ${dateArg}.`);

  const date = new Date(dateArg);
  console.log(`#  Parsed date: ${date}.`);

  if (isNaN(date.valueOf())) {
    throw new Error('Requested date fails to parse by Date constructor.');
  }

  const dateString = date.toISOString();

  const prefixResult = await sh('npm prefix');
  const prefix = prefixResult.stdout.trim();

  const packageLockFile = fs.readFileSync(
    path.join(prefix, 'package-lock.json'),
    'utf8',
  );
  const packageLock: PackageLockV2 = JSON.parse(packageLockFile);

  const dependencies = packageLock.packages[''].dependencies ?? {};
  const devDependencies = packageLock.packages[''].devDependencies ?? {};

  await walkDirectDependencies(dateString, packageLock, dependencies);
  await walkDirectDependencies(dateString, packageLock, devDependencies);

  if (!process.env.PROCESS_FULL_GRAPH) {
    return;
  }

  console.log('\n#  All non-direct dependencies:');
  await walkNonDirectDependencies(dateString, packageLock);
};

main().catch((err) => {
  console.log(`#! ${err.message}`);
  console.error(err);
});
