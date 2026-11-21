const { FileUploadBuilder, LabelBuilder, ModalBuilder } = require('discord.js');

const CLUB_IMAGE_FIELD = 'club-image';
const CLUB_IMAGE_MODAL_PREFIX = 'start-club-image:';

function createClubImageModal(requestId) {
  const upload = new FileUploadBuilder()
    .setCustomId(CLUB_IMAGE_FIELD)
    .setMinValues(1)
    .setMaxValues(1)
    .setFileTypes('.png', '.jpg', '.jpeg', '.webp')
    .setRequired();

  return new ModalBuilder()
    .setCustomId(`${CLUB_IMAGE_MODAL_PREFIX}${requestId}`)
    .setTitle('Зображення клубу')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Завантаж зображення')
        .setDescription('PNG, JPEG або WebP; до 5 МБ.')
        .setFileUploadComponent(upload),
    );
}

module.exports = { CLUB_IMAGE_FIELD, CLUB_IMAGE_MODAL_PREFIX, createClubImageModal };
