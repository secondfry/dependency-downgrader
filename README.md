# dependency-downgrader

Zero dependency dependency date checker and downgrade script generator.

## Usage
```
npm install dependency-downgrader

# Process direct dependencies
npx dependency-downgrader 2022-02-22 > result-direct.sh 2> log.txt
sh result-direct.sh
npm audit

# Process all other dependencies too
PROCESS_FULL_GRAPH=1 npx dependency-downgrader 2022-02-22 > result-all.sh 2> log.txt
sh result-all.sh
npm audit
```

Feeling lucky?
```
npx -y dependency-downgrader 2022-02-22 | sh
PROCESS_FULL_GRAPH=1 npx -y dependency-downgrader 2022-02-22 | sh
```

## Options
| Environment variable   | Description                         |
| ---------------------- | ----------------------------------- |
| `IGNORE_CACHE`         | Forces `npm info` call              |
| `USE_PARTIAL_VERSIONS` | Allows `rc`, `beta`, etc. versions  |
| `PROCESS_FULL_GRAPH`   | Adds full dependency graph analysis |
