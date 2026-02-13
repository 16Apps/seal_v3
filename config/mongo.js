const mongoose = require("mongoose");

    // URL de conexão (local ou Atlas)
   // const mongoURI = 'mongodb://127.0.0.1:27017/airtrack';
    const mongoURI = 'mongodb+srv://diadolivro:btpkafe@cluster0.cqtqv.mongodb.net/airtracking?retryWrites=true&w=majority';
    // const mongoURI = 'mongodb+srv://seal:Al235128@db-connect.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000'

    mongoose.connect(mongoURI, {
        // useNewUrlParser: true,
        // useUnifiedTopology: true
    });

    // Evento de conexão bem-sucedida
    mongoose.connection.on('connected', () => {
        console.log(`Mongoose conectado ao MongoDB em ${mongoURI}`);
    });

    // Evento de erro de conexão
    mongoose.connection.on('error', (err) => {
        console.error(`Erro de conexão do Mongoose: ${err}`);
    });

    // Evento de desconexão
    mongoose.connection.on('disconnected', () => {
        console.log('Mongoose desconectado do MongoDB');
    });

    // Fecha a conexão ao finalizar o processo
    process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('Mongoose desconectado devido à finalização do aplicativo');
        process.exit(0);
    });

    return mongoose.connection;

