# SPDX-License-Identifier: Apache-2.0
FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl python3 python3-venv && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:e360c4d49273347e8ceb740f98d81d0b8b753de7d1b3c3452bdae7ec54289b99 https://raw.githubusercontent.com/go-task/task/v3.54.0/install-task.sh /tmp/install-task.sh
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export CURL_CA_BUNDLE=/run/secrets/ca; fi; \
    sh /tmp/install-task.sh -b /usr/local/bin v3.54.0 && rm /tmp/install-task.sh
ENV PATH="/opt/docs/bin:${PATH}" PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN python3 -m venv /opt/docs
WORKDIR /work
COPY requirements-docs.txt ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export PIP_CERT=/run/secrets/ca NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pip install --no-cache-dir --require-hashes -r requirements-docs.txt && \
    playwright install --with-deps chromium
COPY package*.json ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --ignore-scripts
COPY . .
ENTRYPOINT ["task", "-t", "Taskfile.runtime.yml"]
CMD ["verify"]
