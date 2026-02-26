.PHONY: gql

gql:
	cd server && npm run codegen
	npm run codegen
