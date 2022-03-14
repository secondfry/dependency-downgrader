# npm-dependency-date

Usage:
```
npx npm-dependency-date 2022-02-22 > result.sh 2> log.txt
sh result.sh
```

## Options
IGNORE_CACHE env variable would force `npm info` call instead of cache usage.
i.e.:
```
IGNORE_CACHE=1 npx npm-dependency-date 2022-02-22 > result.sh 2> log.txt
sh result.sh
```
