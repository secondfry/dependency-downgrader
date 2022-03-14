# npm-dependency-date

Usage:
```
npx npm-dependency-date 2022-02-22 > result.sh 2> log.txt
sh result.sh
```

## Options
| Environment variable   | Description                        |
| ---------------------- | ---------------------------------- |
| `IGNORE_CACHE`         | Forces `npm info` call             |
| `USE_PARTIAL_VERSIONS` | Allows `rc`, `beta`, etc. versions |
