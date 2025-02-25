#!/bin/bash
docker image build -f Dockerfile -t forum-docker .
docker container run -p 4848:4848 --detach --name forum forum-docker