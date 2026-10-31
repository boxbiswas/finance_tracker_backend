import mongoose from 'mongoose';
import dns from 'dns';

// Fix for Windows / VPN / Cloudflare WARP environments where Node SRV DNS lookup fails
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
    // Fall back to default DNS if setting servers fails
}

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/finance_tracker';
        const conn = await mongoose.connect(mongoUri);
        console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        console.error('⚠️  Action required: Whitelist your current IP address on MongoDB Atlas (Network Access -> Add IP Address).');
    }
};

export default connectDB;