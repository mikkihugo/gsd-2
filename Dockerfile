# ──────────────────────────────────────────────
# Runtime
# Image: ghcr.io/gsd-build/sf-run
# Used by: end users via docker run
# ──────────────────────────────────────────────
FROM node:24-slim AS runtime

# Git is required for SF's git operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install SF globally — version is controlled by the build arg
ARG SF_VERSION=latest
RUN npm install -g sf-run@${SF_VERSION}

# Default working directory for user projects
WORKDIR /workspace

ENTRYPOINT ["gsd"]
CMD ["--help"]
