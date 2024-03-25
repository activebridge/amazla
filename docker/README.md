## Local Commands

#### Build for local and server machines

```
docker buildx build . -t tesla-proxy:mac
docker buildx build . -t ediff/tesla-proxy:latest --platform linux/amd64
```

#### Run on Local

To run on local create folder and place 3 files

- tls-key: privkey1.pem
- tls-cert: fullchain1.pem
- tesla private key: fullchain1.pem

On run command change path to folder where are certs and keys placed.

```
docker run -v /Users/alexkarpenko/projects/files:/keys --rm -p 443:443/tcp tesla-proxy:mac
```

#### Push To DockerHub

```
docker push ediff/tesla-proxy:latest
```

## Server Commands

Before run image on server generate SSL certs via certbot. Once generated place your Tesla private-key to **/etc/letsencrypt/archive/domain_name** folder and rename file to **fullchain1.pem**

```
docker pull ediff/tesla-proxy:latest
docker stop $(docker ps -a -q)
docker run -d -v /etc/letsencrypt/archive/tesla.activebridge.org:/keys --rm -p 443:443/tcp ediff/tesla-proxy:latest
```

## Update Certs
```
certbot certonly -d tesla.activebridge.org
cd /etc/letsencrypt/archive/tesla.activebridge.org-0002
cp ../tesla.activebridge.org/private.pem private.pem
docker run -d -v /etc/letsencrypt/archive/tesla.activebridge.org-0002:/keys --rm -p 443:443/tcp ediff/tesla-proxy:latest
```
