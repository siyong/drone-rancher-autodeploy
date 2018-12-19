FROM node:10-alpine
LABEL maintainer="Wang Siyong <siyong@vaultdragon.com>"

ADD ./package.json /app/package.json
WORKDIR /app
RUN npm install

# add app
ADD . /app


#add entrypoint and start up scripts
ADD .docker /usr/local/bin

#set permission
RUN chmod +x -R /usr/local/bin
#entrypoint script to set env vars when linking containers for dev
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

#Default command to run on start up
#CMD ["/usr/local/bin/start-app.sh"]
CMD ["node","index.js"]