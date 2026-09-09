# syntax=docker/dockerfile:1
# Explicit owner build, never run automatically by scope launch.
# For repeatable builds, pass NODE_IMAGE=node@sha256:<approved digest>.
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}
ARG UV_VERSION=0.11.6
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash build-essential ca-certificates curl wget git jq ripgrep procps psmisc \
    tar gzip bzip2 xz-utils zip unzip python3 python3-pip python3-venv \
    && python3 -m pip install --no-cache-dir --break-system-packages "uv==${UV_VERSION}" \
    && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp BASH_ENV=/dev/null ENV=/dev/null
WORKDIR /workspace
# No VOLUME or host credentials. Runtime supplies writable /workspace and /tmp
# as UID 65534; install project packages locally, or into a /tmp virtualenv.
