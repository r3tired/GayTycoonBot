const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { CLUB_NAME_MIN, CLUB_NAME_MAX } = require('./clubName');

const CLUB_NAME_FIELD = 'club-name';

function createClubNameModal(customId, title, currentName) {
  const input = new TextInputBuilder()
    .setCustomId(CLUB_NAME_FIELD)
    .setLabel('Название твоего гей-клуба')
    .setPlaceholder('Например: Розовый единорог')
    .setStyle(TextInputStyle.Short)
    .setMinLength(CLUB_NAME_MIN)
    .setMaxLength(CLUB_NAME_MAX)
    .setRequired(true);
  if (currentName) input.setValue(currentName);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

module.exports = { CLUB_NAME_FIELD, createClubNameModal };
