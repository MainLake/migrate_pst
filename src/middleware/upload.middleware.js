const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        cb(null, backupDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const finalPath = path.join(process.env.BACKUP_DIR || path.join(__dirname, '../../backups'), file.originalname);

        if (fs.existsSync(finalPath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            cb(null, `${basename}_${timestamp}${ext}`);
        } else {
            cb(null, file.originalname);
        }
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.dump' || ext === '.sql') {
            cb(null, true);
        } else {
            cb(new Error('Only .dump and .sql files are allowed'));
        }
    }
});

module.exports = upload;
