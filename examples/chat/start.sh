#!/bin/sh
erl -pa ebin deps/*/ebin -s chat \
	-eval "io:format(\"Point your browser at http://localhost:8080~n\")."
