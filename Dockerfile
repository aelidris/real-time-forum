# Use the official Go image based on Alpine for a lightweight build
FROM golang:1.21-alpine

# Install dependencies for building the Go application and CGO (SQLite requires CGO)
RUN apk update && apk add --no-cache \
    gcc \
    musl-dev \
    bash

# Set the working directory inside the container
WORKDIR /forum

COPY . .

# Copy Go module files (go.mod and go.sum) to the container and download dependencies
RUN go mod download

ENV CGO_ENABLED=1


# Specify the command to run the Go application
CMD ["go" , "run" , "main.go"]