# omni-lock-multisig-example

Example code to:
1. Generate omni-lock-multisig-admin-cell
2. Unlock omni-lock-multisig-cell
3. Update omni-lock-multisig-admin-cell(update multisigScript)

## Build omni-lock

```bash
git submodule update --init --recursive
cd ckb-production-scripts
make all-via-docker
```

## Run tests

```bash
# cd docker
docker-compose up -d

# cd project
yarn test
```