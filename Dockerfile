FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs lab.mjs capture.mjs ./
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
