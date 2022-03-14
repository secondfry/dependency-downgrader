# npm-dependency-date

Zero dependency dependency date checker and downgrade script generator.

## Usage
```
npx npm-dependency-date 2022-02-22 > result.sh 2> log.txt
sh result.sh
```

Feeling lucky?
```
npx npm-dependency-date 2022-02-22 | sh
```

## Options
| Environment variable   | Description                        |
| ---------------------- | ---------------------------------- |
| `IGNORE_CACHE`         | Forces `npm info` call             |
| `USE_PARTIAL_VERSIONS` | Allows `rc`, `beta`, etc. versions |
