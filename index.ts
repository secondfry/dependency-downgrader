import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

type CommandResult = {
  stdout: string;
  stderr: string;
};

const sh = (cmd: string) => {
  return new Promise<CommandResult>((resolve, reject) => {
    console.error('[node.js]>', cmd);
    exec(cmd, (err, stdout, stderr) => {
      if (stdout) console.error(`> stdout\n${stdout}< stdout`);
      if (stderr) console.error(`> stderr\n${stderr}< stderr`);

      if (err) {
        return reject(err);
      }

      resolve({ stdout, stderr });
    });
  });
};

type Dependencies = { [packageName: string]: string };

type Package = {
  version: string;
  resolved: string;
  integrity: string;
  dev: boolean;
  requires: Dependencies;
};

type PackageLockV2 = {
  lockfileVersion: 2;
  packages: {
    '': {
      dependencies?: Dependencies;
      devDependencies?: Dependencies;
    };
  };
  dependencies: { [packageName: string]: Package };
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

  const infoResult = await sh(`npm info --json ${packageName}@${requestedVersion}`);
  const info: NpmInfo = JSON.parse(infoResult.stdout);

  const cacheFileBaseDir = path.dirname(cacheFilePath);
  if (!fs.existsSync(cacheFileBaseDir)) {
    fs.mkdirSync(cacheFileBaseDir);
  }

  fs.writeFileSync(cacheFilePath, JSON.stringify(info), 'utf-8');

  return info;
};

const checkPackage = async (date: string, packageName: string, requestedVersion: string, actualVersion: string) => {
  const info = await getNpmInfo(packageName, requestedVersion);
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
  let versions = Object.keys(info.time);

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
      console.log(`#  ${packageName}@${versions[0]}: ${info.time[versions[0]!]}.`);
      console.log(`npm install ${packageName}@${versions[0]}`);
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

const walkDependencies = async (date: string, packageLock: PackageLockV2, deps: Dependencies) => {
  return Promise.all(
    Object.entries(deps).map(async ([packageName, requestedVersion]) => {
      const actualVersion = packageLock.dependencies[packageName]?.version;
      if (!actualVersion) {
        console.log(`#! package-lock.json is missing .dependecies.${packageName}`);
        return;
      }

      return checkPackage(date, packageName, requestedVersion, actualVersion);
    }),
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

  const packageLockFile = fs.readFileSync(path.join(prefix, 'package-lock.json'), 'utf8');
  const packageLock: PackageLockV2 = JSON.parse(packageLockFile);

  const dependencies = packageLock.packages[''].dependencies ?? {};
  const devDependencies = packageLock.packages[''].devDependencies ?? {};

  await walkDependencies(dateString, packageLock, dependencies);
  await walkDependencies(dateString, packageLock, devDependencies);
};

main().catch((err) => {
  console.log(`#! ${err.message}`);
  console.error(err);
});
