all:
	node build.js

test:
	@echo Testing js/
	@node js/test.js

.PHONY: all test
