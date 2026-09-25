const msal = require('@azure/msal-node');

const msalConfig = {
    auth: {
        clientId: process.env.AZURE_CLIENT_ID || '',
        authority: process.env.AZURE_AUTHORITY || 'https://login.microsoftonline.com/organizations',
        clientSecret: process.env.AZURE_CLIENT_SECRET || ''
    }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

module.exports = cca;