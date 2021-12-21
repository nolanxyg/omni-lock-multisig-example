# omni-lock-multisig

## Build omni-lock

```bash
git submodule update --init --recursive
cd ckb-production-scripts
make all-via-docker
```

## Run tests

```bash
cd docker
docker-compose up -d
cd ..
yarn test
```