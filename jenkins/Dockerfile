FROM jenkins/jenkins:lts-jdk17
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends docker-cli git \
    && rm -rf /var/lib/apt/lists/*
USER jenkins
RUN jenkins-plugin-cli --plugins workflow-aggregator git timestamper pipeline-stage-view
USER root
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false"
COPY init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/
COPY Jenkinsfile /usr/share/jenkins/ref/Jenkinsfile
