# npm init -y
# alterar package.json, index.js, para server.js
# npm install express express-ejs-layouts cors body-parser ejs shortid
# criar um arquivo server.js
# criar as pastas public, views
# view, alocara os ejs, layouts e paginas
# nos layouts remover o corpo e inserir <%- body %>
# nas paginas inserior na primeira linha <%- contentFor('body') %>

# public, alocara css, js, images
# estrura modelo desse projeto
# Angular, incluir a biblioteca nos layouts
  <script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.6.9/angular.min.js"></script>
# Criar a pasta controller em public
# Criar arquivo app.js, controlador da aplicação
# Vincular nos layouts, a chamada da aplicação ng-app="myApp"
# Mongo
# npm install mongoose
# criar a pasta config, e o arquivo mongo.js com a conexão
# no server.js requisita-lo
# em public criar as pastas mongo, e dentro routes e models

# Heroku Deploy
  - create git
	$ git init
	$ heroku git:remote -a sealairtracking
    
  - deploy
  $ git config core.autocrlf true
  $ git add .
  $ git commit -am "deploy_start"
  $ git push heroku master

  $ heroku logs --tail -a seal

  #152.55.180.123
  #


-Deploy Git Ambiente
git init
git add .
git config core.autocrlf true
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/16Apps/seal_v3.git
git push -u origin main


- deploy GIT
git add .
git commit -m "Atualização Seal"
git push
