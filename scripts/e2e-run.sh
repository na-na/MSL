# This script needs to be executed from the root directory.

npm install msl-server-node
./node_modules/msl-server/bin/msl --basedir=./msl-sample-app --port=8001 --debug=true &
cd msl-client-java
mvn clean verify
kill -9 $!
