
const nodemailer = require("nodemailer");

module.exports = (app, dbConnection) => {

    app.post("/send-email", async (req, res) => {
        const { to, subject, message } = req.body;

        // Configuração para email GoDaddy
        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465, // ou 587 se quiser STARTTLS
            secure: true, // true para SSL
            auth: {
                user: "brauliotpinto.dev@gmail.com", // substitua
                pass: "qpyz vvcr bnbw acii"
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        const mailOptions = {
            from: '"Seal <seal.dev@gmail.com>', // nome e email de origem
            to: to,
            subject: subject,
            html: message
        };

        try {
            await transporter.sendMail(mailOptions);
            res.json({ success: true, message: "Email enviado com sucesso!" });
        } catch (error) {
            console.error("Erro ao enviar email:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
}