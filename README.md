# MeliProxy by @fdx

## Problema:

https://docs.google.com/document/d/1sicsLNJwF4LAWN2UR8e7ugklOS4FhyGWCNadPJ134yA

## Pre-requisites:

- `docker` and `docker-compose`: Used to build and run all the services together.
- `docker-machine`: https://docs.docker.com/machine/get-started/
- Run: `eval $(docker-machine env default)` (must work or stop!)

## Quick start:

### Clone, build and start services:
```bash
git clone https://github.com/fdx/meliproxy.git
cd meliproxy
sh ./up.sh
```

### Test the proxy:
```bash
curl -v http://`docker-machine ip default`/categories/MLA97994
```

### Output:
```
*   Trying 192.168.99.100...
* TCP_NODELAY set
* Connected to 192.168.99.100 (192.168.99.100) port 80 (#0)
> GET /categories/MLA97994 HTTP/1.1
> Host: 192.168.99.100
> User-Agent: curl/7.54.0
> Accept: */*
> 
< HTTP/1.1 200 OK
< date: Mon, 06 Nov 2017 14:11:48 GMT
< content-type: application/json; charset=utf-8
< content-length: 1457
< cache-control: max-age=600,stale-while-revalidate=300, stale-if-error=1200
< x-content-type-options: nosniff
< x-request-id: 7c84c3c9-bc02-96de-af70-cb2d62a51996
< x-frame-options: DENY
< x-xss-protection: 1; mode=block
< access-control-allow-origin: *
< access-control-allow-headers: Content-Type
< access-control-allow-methods: PUT, GET, POST, DELETE, OPTIONS
< access-control-max-age: 86400
< vary: Accept-Encoding, User-Agent
< x-envoy-upstream-service-time: 825
< server: envoy
< 
* Connection #0 to host 192.168.99.100 left intact
{"id":"MLA97994","name":"32GB","picture":null,"permalink":null,"total_items_in_this_category":97,"path_from_root":[{"id":"MLA1051","name":"Celulares y Teléfonos"},{"id":"MLA1055","name":"Celulares y Smartphones"},{"id":"MLA32089","name":"iPhone"},{"id":"MLA340374","name":"iPhone 4S"},{"id":"MLA97994","name":"32GB"}],"children_categories":[],"attribute_types":"attributes","settings":{"adult_content":false,"buying_allowed":true,"buying_modes":["auction","buy_it_now"],"catalog_domain":"MLA-CELLPHONES","coverage_areas":"not_allowed","currencies":["ARS"],"fragile":false,"immediate_payment":"required","item_conditions":["not_specified","new","used"],"items_reviews_allowed":false,"listing_allowed":true,"max_description_length":50000,"max_pictures_per_item":12,"max_pictures_per_item_var":10,"max_sub_title_length":70,"max_title_length":60,"maximum_price":null,"minimum_price":null,"mirror_category":null,"mirror_master_category":null,"mirror_slave_categories":[],"price":"required","reservation_allowed":null,"restrictions":[],"rounded_address":false,"seller_contact":"not_allowed","shipping_modes":["not_specified","me1","custom","me2"],"shipping_options":["custom","carrier"],"shipping_profile":"optional","show_contact_information":false,"simple_shipping":"optional","stock":"required","sub_vertical":"smartphones","subscribable":null,"tags":[],"vertical":"consumer_electronics","vip_subdomain":"articulo"},"meta_categ_id":43896,"attributable":false}
```

### Admin panel:
```bash
open http://`docker-machine ip default`:5000/
```

![Screenshot of the admin panel](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-proxy-control.png)

## Elección de tecnologías:

- Estuve evaluando utilizar *AWS-ELB*, *Nginx*, *HAProxy* y *Envoy*. Descarté los primeros 3 porque:
  * *AWS-ELB*: Descartado porque no permite llegar a niveles de configuración de rate-limiting, además no escala bien con spikes de tráfico muy violentos.
  * *Nginx*: La versión community no da la posibilidad de utilizar un storage compartido entre varias instancias de Nginx. La plus está fuera de scope para el tipo de solución que se quiere armar.
  * *HAProxy*: Me encontré con la misma problemática que Nginx, generalmente todo funciona en un mismo server, pero si se quiere alcanzar un throughput de 50mil reqs/sec un sólo server no es suficiente.
- La tecnología elegida fue *Envoy*:
  * https://www.envoyproxy.io/
  * Desarrollado por Lyft (simil Uber, San Francisco based).
  * Es un proyecto nuevo que está teniendo muchísima adopción en las tech-startups alrededor del mundo (open source hace 1 año).
  * Ya soporta cargas en producción de mayor volumen que el solicitado.
  * El rate-limiting está implementado con un call gRPC hacia otro host (see below).
  * Es posible tener N-hosts funcionando, pero al mismo tiempo tener métricas precisas de uso para el rate-limit a nivel global.
  * Está escrito en C++, con alta performance en mente.
  * Además de ser un reserve-proxy tiene features de service-discovery.
  * Funciona en Layer 7 y 4.
  * Sirve (y recomiendan usarlo), como proxy TCP para las base de datos.
  * Con el service-discovery las apps se conectan al proxy y este routea a donde corresponde.
  * Calcula métricas que permite tracear fácilmente problemas y bottlenecks.
  * Era divertido aprender una tecnología nueva! :)
- Una vez resuelta la elección del proxy principal, hubo una serie de tecnologías ad-hoc que tuve que utilizar para armar la solución completa:
  * *Lyft/ratelimit*: Servicio gRPC (Go) al cual se le pide autorización para servir cada requests o devolver HTTP 429.
  * *Redis*: El storage del servicio de ratelimit tipo key/value.
  * *MongoDB*: Se usa para grabar estadísticas de uso de la solución.
  * *Zipkin*: Se integra como un servicio de tracing donde se puede ver el tiempo de cada request internamente.
  * *NodeJS*: Se desarrolló un daemon que lee los access.logs de Envoy, los sumariza y los escribe en MongoDB.
  * *Express.js*: API Rest basado en Express.
  * *React.js*: Dashboard muy simple utilizando React, la información se consume exclusivamente desde API Rest.

### Diagrama completo de la solución:

![MeliProxy](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/MeliProxy.png)

## Consideraciones generales:

- El servicio se puede levantar por completo utilizando el comando: `./up.sh` (docker-compose)
- Este comando levanta un total de 8 containers de Docker integrados entre sí.
- Puede deployarse a AWS sin problemas (ver cómo escala), dado que los diferentes hosts se controlan con variables de entorno.

## Servicio Envoy:

- Docker base image: FROM lyft/envoy:latest
- Ports relevantes: 80 (main proxy listener), 8001 (admin)
- Es un daemon de Envoy que tiene configurado un cluster de MercadoLibre vía HTTPS (host único).
- El rate-limiting está configurado como un servicio gRPC externo, al cual se le envía información de contexto de cada request.
- Es una versión de development, que adapté modificando los files ratelimit.cc, ratelimit_impl.cc y router_ratelimit.cc (C++) para que tenga mayor verbosity del context, porque no estaba claro cómo se enviaba al servicio de ratelimiting.
- Hice un script llamado "fdx_debug_build.sh" que compila la versión de debug y deja el binario en "./envoy-debug".
- Puede escalar horizontalmente.

![Envoy](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-envoy.png)

## Servicio Ratelimit:

- Docker base image: FROM golang:1.8
- Ports relevantes: 8081 (gRPC HTTP2 listener for ratelimitting)
- Es un daemon hecho en Go, que atiende llamados gRPC.
- Su principal objetivo es decir si un request tiene que ser frenado o puede ser entregado.
- El storage de las estadísticas de uso por contexto se lleva en Redis.
- Compilé mi propia versión de desarrollo, mi intención era mejorar más las reglas por default que trae.

![Ratelimit](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-ratelimit.png)

## Servicio Redis:

- Docker base image: FROM redis:alpine
- Ports relevantes: 6379 (Redis)
- Se usa sólo en el stack de Docker Compose, es para el storage de ratelimitting.

![Redis](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-redis.png)

## Servicio Logs:

- Docker base image: FROM node:latest
- Ports relevantes: N/A
- Es un daemon que desarrollé para que esté monitoreando el directorio de un volumen compartido de logs
- En cuanto cambia un file dentro de este directorio, se procesa, se sumarizan las cantidades en objetos con las propiedades: datetime, date, hour, totalQty, okQty, ratelimitQty, notfoundQty, errorQty, durationAvg, latencyAvg
- Estos datos se calculan contando y promediando por hora.

![Logs](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-logs.png)

## Servicio API:

- Docker base image: FROM node:latest
- Ports relevantes: 7000 (API Rest)
- Desarrollé una API Rest read-only para obtener la información necesaria para la UI y gestión en general.
- Es una aplicación basada en Express.js.
- Endpoint /stats: Se conecta al MongoDB y obtiene las stats de las últimas 24 hs.
- Endpoint /servers: Se conecta a todos los servers en el cluster de Envoy, y hace 2 API calls para cada uno (/server_info y /stats). Devuelve toda la información junta.

![API](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-api.png)

## Servicio MongoDB:

- Docker base image: FROM mongo:latest
- Ports relevantes: 27017 (MongoDB)
- Se usa sólo en el stack de Docker Compose, es para el storage de las estadísticas de uso.

![Mongo](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-mongo.png)

## Servicio Proxy-Control:

- Docker base image: FROM node:latest
- Ports relevantes: 5000 (HTTP Frontend)
- Es una aplicación basada en React.js, que muestra una interfaz muy sencilla con información obtenida exclusivamente desde la API Rest

![Proxy-Control](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-proxy-control.png)

## Servicio Zipkin:

- Docker base image: FROM openzipkin/zipkin
- Ports relevantes: 9411 (Zipkin HTTP)
- Se integró la solución con Zipkin para analizar el timing exacto de cada request.

![Zipkin](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/screenshot-zipkin.png)

## Estrategia de escalamiento de la solución:

- Hice una prueba de concepto en AWS, utilizando el servicio de ECS.
- Creé 2 instancias de Envoy, y 2 instancias de Ratelimit, demostrando que ambos servicios pueden crecer horizontalmente sin restricciones de lógica.
- Con Route53 creé un A record con múltiples valores, que balancea 50%/50% entre ambos hosts de Envoy.
- Cabe aclarar que la solución funciona con N cantidad de hosts!
- Como storage para las stats de Ratelimit un Redis de AWS ElasticCache. En su mejor versión puede ser un Cluster de muchos servers replicados en diferentes zonas.
- Proof-of-concept funcionando en: https://meliproxy.guilleron.io/ (tipo de instancias "micro", estará funcionando sólo unos días por cuestiones de costos)
- Se estima que los tipos de instancia que hay que utilizar para Envoy y Ratelimit son `c4.8xlarge`.
- La base de datos Mongo no es necesario que sea un tipo de instancia grande, dado que no tiene mucha carga (siempre y cuando se haga el proyecto de optimizar la ingesta de logs - aws, o mejor efectividad).
- Los endpoints de API/admin pueden quedar en un tipo de instancia de poco tamaño.

### Publicly available proof-of-concept on AWS:

http://meliproxy.guilleron.io/

![Amazon Web Services](https://raw.githubusercontent.com/fdx/meliproxy/master/assets/aws.png)

## Next steps:

- Utilizar los builds de producción de todas las tecnologías.
- Pruebas de benchmark sobre un cluster productivo en AWS, para hacer el cálculo inicial necesario de nodos para 50k reqs/sec.
- El servicio de rate-limiting de gRPC (out of the box), si recibe contextos complejos no funciona correctamente. Es un servicio bastante simple, dado que ya tiene abstraída toda la complejidad del request y del storage. Se podría hacer algo bastante mas elaborado que lo pedido en el documento de especificación originalmente.
- Abstraer el Dockerfile y meli-proxy.json de Envoy, con templates para dividir mas prolijo entre los ambientes de Docker Compose y AWS.
- Ajustar mejor los timeouts del proxy, en base a escenarios reales.
- En entorno de producción Envoy tiene hardcodeados los hosts de Ratelimit, esto tendría que ser dinámico (ver siguientes puntos API).
- Cerrar ports innecesarios de la aplicación de AWS, y restringir los necesarios sólo para consumo interno.
- Ver si hay soluciones alternativas a Zipkin, que usen OpenTracing y que tengan mejores dashboards e interfaz.
- Ver cómo escala horizontalmente el servicio Zipkin (si es el elegido para quedar en producción).
- Hacer autenticación OAuth para la API, dado que su endpoint debe ser público.
- Mejorar la UI del Proxy-Control, integrando con Redux, cacheando resultados de API calls y mejorando la UX.
- Migrar la API a GraphQL (personalmente lo prefiero, pero la especificación del proyecto decía REST).
- Integrar accesslogs con AWS CloudWatch logs, de forma tal de tenerlos en un sólo lugar integrados.
- Que los containers de la API escalen horizontalmente (se puede por diseño sin problemas).
- Pensar en mecanismos de cache, pooling, entre otros para obtener las stats de los distintos servers en background (non-blocking).
- Dar la posibilidad de las que las reglas de ratelimiting se controlen mediante la API, incluyendo además mejores endpoints para ver a quién limitamos.
- Llevar tracking de la arquitectura interna del sistema (e.g. saber si la solución escaló y tenemos 100 nodos en ves de 50), exponer la info en la API.
- Poder medir la carga de los distintos endpoints.
- Sistema de monitoreo y alarmas en base a distintos criterios.
- Ajustar timezone en la UI según el cliente (con moment.js).
