FROM node:24-slim

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bubblewrap ca-certificates ffmpeg file fonts-dejavu-core fonts-liberation2 \
    git graphviz jq libreoffice pandoc poppler-utils python3 python3-pip \
    python3-venv ripgrep tesseract-ocr unzip util-linux zip \
  && rm -rf /var/lib/apt/lists/*

COPY agent/sandbox/image/beeblio_research.py /opt/beeblio-research/beeblio_research.py
COPY agent/sandbox/image/python-analysis-requirements.txt /opt/beeblio-python-requirements.txt
COPY agent/sandbox/image/office-documents-requirements.txt /opt/beeblio-office-requirements.txt

RUN groupadd --gid 10001 beeblio-job \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin beeblio-job \
  && python3 -m venv /opt/beeblio-python \
  && /opt/beeblio-python/bin/pip install --no-cache-dir -r /opt/beeblio-python-requirements.txt \
  && /opt/beeblio-python/bin/pip install --no-cache-dir -r /opt/beeblio-office-requirements.txt \
  && chmod -R a-w /opt/beeblio-python

WORKDIR /blaxel
COPY infra/blaxel-analysis-job/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts
COPY agent/skills /opt/beeblio-skills
RUN ln -s /blaxel/node_modules /opt/beeblio-skills/node_modules \
  && chmod -R a-w /opt/beeblio-skills
COPY infra/blaxel-analysis-job/worker.mjs ./worker.mjs

ENV PYTHONPATH=/opt/beeblio-research
ENV PATH=/opt/beeblio-python/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV PIP_NO_INDEX=1
ENTRYPOINT ["node", "worker.mjs"]
