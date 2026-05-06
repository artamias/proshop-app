import path from 'path';
import express from 'express';
import multer from 'multer';

const router = express.Router();

// path absolute refers to env
const uploadDir =
  process.env.NODE_ENV === 'production'
    ? '/var/data/uploads'
    : path.resolve('uploads');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    cb(
      null,
      `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
    );
  },
});

function fileFilter(req, file, cb) {
  const filetypes = /jpe?g|png|webp/;
  const mimetypes = /image\/jpe?g|image\/png|image\/webp/;

  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = mimetypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Images only!'), false);
  }
}

const upload = multer({ storage, fileFilter });

router.post('/', upload.single('image'), (req, res) => {
  if (req.file) {
    //return url path
    res.status(200).send({
      message: 'Image uploaded successfully',
      image: `/uploads/${req.file.filename}`,
    });
  } else {
    res.status(400).send({ message: 'No image file provided' });
  }
});

export default router;
