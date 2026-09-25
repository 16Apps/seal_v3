
#Dependências
sudo apt update
sudo apt install -y git curl nginx

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node -v
npm -v
sudo npm install -g pm2


#Deploy Git Ambiente
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/16Apps/seal_v3.git
git push -u origin main


#Criação das Pastas
sudo mkdir -p /var/www
sudo chown -R ubuntu:ubuntu /var/www
cd /var/www


#Git Clone AWS
git clone https://github.com/16Apps/seal_v3.git
cd seal_v3
ls -la


#Url Pública
http://alb-seal-suvinil-1263672527.sa-east-1.elb.amazonaws.com/
Login: suvinil_teste@seal.com.br
Senha: 123

0000011577
#PM2 
cd /var/www
cd seal_v3
pm2 start server.js --name seal
pm2 save
pm2 startup
pm2 save

pm2 resurrect
pm2 ls
systemctl status pm2-ubuntu

#Editar Arquivo
nano uteis.js
Ctrl + O → salvar
Enter → confirmar o nome do arquivo
Ctrl + X → sair

pm2 restart seal

