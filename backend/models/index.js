const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const User = require('./User');
const Campaign = require('./Campaign');
const CampaignAudience = require('./CampaignAudience');
const Contact = require('./Contact');
const Template = require('./Template');
const Message = require('./Message');
const Notification = require('./Notification');
const InboxMessage = require('./InboxMessage');
const ClientWhatsApp = require('./ClientWhatsApp');
const Client = require('./Client');
const WhatsAppAccount = require('./WhatsAppAccount');
const CannedMessage = require('./CannedMessage');
const Flow = require("./Flow");
const Account = require('./Account');
const RealConversation = require('./RealConversation');
const PasswordResetToken = require('./PasswordResetToken');

// Import meta models for webhooks
const WebhookLog = require('./metaWebhook')(sequelize, DataTypes);
const MetaMessage = require('./metaMessage')(sequelize, DataTypes);

// Define associations
User.hasMany(Campaign, { foreignKey: 'userId', onDelete: 'CASCADE' });
Campaign.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Contact, { foreignKey: 'userId', onDelete: 'CASCADE' });
Contact.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Template, { foreignKey: 'userId', onDelete: 'CASCADE' });
Template.belongsTo(User, { foreignKey: 'userId' });

Campaign.hasMany(Message, { foreignKey: 'campaignId', onDelete: 'CASCADE' });
Message.belongsTo(Campaign, { foreignKey: 'campaignId' });

Campaign.hasMany(CampaignAudience, { foreignKey: 'campaignId', onDelete: 'CASCADE' });
CampaignAudience.belongsTo(Campaign, { foreignKey: 'campaignId' });

Contact.hasMany(Message, { foreignKey: 'contactId', onDelete: 'CASCADE' });
Message.belongsTo(Contact, { foreignKey: 'contactId' });

Contact.hasMany(InboxMessage, { foreignKey: 'contactId', onDelete: 'CASCADE' });
InboxMessage.belongsTo(Contact, { foreignKey: 'contactId' });

User.hasMany(InboxMessage, { foreignKey: 'userId', onDelete: 'CASCADE' });
InboxMessage.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(ClientWhatsApp, { foreignKey: 'client_id', onDelete: 'CASCADE' });
ClientWhatsApp.belongsTo(User, { foreignKey: 'client_id' });

Client.hasMany(WhatsAppAccount, { foreignKey: 'client_id', onDelete: 'CASCADE' });
WhatsAppAccount.belongsTo(Client, { foreignKey: 'client_id' });

User.hasMany(CannedMessage, { foreignKey: 'userId', onDelete: 'CASCADE' });
CannedMessage.belongsTo(User, { foreignKey: 'userId' });

const syncDatabase = async () => {
  try {
    // Use force: false to avoid recreating tables
    // Only create tables if they don't exist
    await sequelize.sync({ force: false, alter: false });
    console.log('✅ Database synchronized successfully.');
    
    // Ensure InboxMessage table exists (create if doesn't exist)
    try {
      await InboxMessage.sync({ force: false, alter: true });
      console.log('✅ InboxMessage table verified/created.');
    } catch (inboxError) {
      console.error('⚠️  InboxMessage table sync error:', inboxError.message);
      console.error('Full error:', inboxError);
    }
    
    // Ensure CampaignAudience table exists
    try {
      await CampaignAudience.sync({ force: false, alter: true });
      console.log('✅ CampaignAudience table verified/created.');
    } catch (audienceError) {
      console.error('⚠️  CampaignAudience table sync error:', audienceError.message);
    }
    
    // Ensure Campaign table has new columns (template_name, template_language, etc.)
    try {
      await Campaign.sync({ force: false, alter: true });
      console.log('✅ Campaign table synced with new columns.');
    } catch (campaignError) {
      console.error('⚠️  Campaign table sync error:', campaignError.message);
    }
    
    // Ensure Template table has updated ENUM values (including marketing category)
    try {
      await Template.sync({ force: false, alter: true });
      console.log('✅ Template table synced with updated categories.');
    } catch (templateError) {
      console.error('⚠️  Template table sync error:', templateError.message);
    }
    // Ensure User table has updated role ENUM (admin, manager, agent, user)
    try {
      await User.sync({ force: false, alter: true });
      console.log('✅ User table synced with updated roles (admin, manager, agent, user).');
    } catch (userError) {
      console.error('⚠️  User table sync error:', userError.message);
    }
    // Ensure Users mobile column exists (supports mobile_number / mobileNumber)
    try {
      const queryInterface = sequelize.getQueryInterface();
      let userTable = 'users';
      let table;
      try {
        table = await queryInterface.describeTable('users');
      } catch (_) {
        userTable = 'Users';
        table = await queryInterface.describeTable('Users');
      }
      const hasMobileColumn = !!table.mobile_number || !!table.mobileNumber;
      if (!hasMobileColumn) {
        await queryInterface.addColumn(userTable, 'mobile_number', {
          type: DataTypes.STRING(20),
          allowNull: true,
          unique: true
        });
        console.log(`✅ ${userTable}.mobile_number column added.`);
      } else {
        console.log('✅ Users mobile column already exists.');
      }
    } catch (mobileColumnError) {
      console.error('⚠️  Users mobile column ensure error:', mobileColumnError.message);
    }
    // Ensure Contact table has whatsappOptInAt for keyword opt-in
    try {
      const Contact = require('./Contact');
      await Contact.sync({ force: false, alter: true });
      // contacts should be unique per user + phone (not globally by phone)
      try {
        const queryInterface = sequelize.getQueryInterface();
        const indexes = await queryInterface.showIndex('contacts');
        const fieldNames = (idx) => (idx.fields || []).map((f) => f.attribute || f.name).filter(Boolean);
        const hasProjectScopedUnique = indexes.some((idx) => {
          const fields = fieldNames(idx);
          return (
            idx.unique &&
            fields.length === 3 &&
            fields.includes('userId') &&
            fields.includes('phone') &&
            fields.includes('projectId')
          );
        });

        if (!hasProjectScopedUnique) {
          for (const idx of indexes) {
            const fields = fieldNames(idx);
            if (!idx.unique || idx.name === 'PRIMARY') continue;
            const isLegacyPhoneOnly = fields.length === 1 && fields[0] === 'phone';
            const isLegacyUserPhone = fields.length === 2 && fields.includes('userId') && fields.includes('phone');
            if (isLegacyPhoneOnly || isLegacyUserPhone) {
              try {
                await queryInterface.removeIndex('contacts', idx.name);
                console.log(`✅ Removed legacy unique index on contacts (${idx.name}).`);
              } catch (removeErr) {
                console.error(`⚠️ Could not remove index ${idx.name}:`, removeErr.message);
              }
            }
          }
          await queryInterface.addIndex('contacts', ['userId', 'phone', 'projectId'], {
            unique: true,
            name: 'contacts_user_phone_project_unique'
          });
          console.log('✅ Added contacts unique index on (userId, phone, projectId).');
        } else {
          console.log('✅ contacts unique index (userId, phone, projectId) already exists.');
        }
      } catch (contactIndexError) {
        console.error('⚠️ Contact index ensure error:', contactIndexError.message);
      }
      console.log('✅ Contact table synced (whatsappOptInAt).');
    } catch (contactError) {
      console.error('⚠️  Contact table sync error:', contactError.message);
    }

    // Ensure messages table supports project scoping.
    try {
      const queryInterface = sequelize.getQueryInterface();
      const messageTable = await queryInterface.describeTable('messages');
      if (!messageTable.projectId) {
        await queryInterface.addColumn('messages', 'projectId', {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null
        });
        console.log('✅ messages.projectId column added.');
      } else {
        console.log('✅ messages.projectId column already exists.');
      }

      await sequelize.query(`
        UPDATE messages m
        JOIN contacts c ON c.id = m.contactId
        SET m.projectId = c.projectId
        WHERE m.projectId IS NULL
          AND c.projectId IS NOT NULL
      `);
    } catch (messageProjectError) {
      console.error('⚠️ messages projectId ensure error:', messageProjectError.message);
    }

    // Ensure conversations table supports project scoping.
    try {
      const queryInterface = sequelize.getQueryInterface();
      const conversationTable = await queryInterface.describeTable('conversations');
      if (!conversationTable.project_id) {
        await queryInterface.addColumn('conversations', 'project_id', {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null
        });
        console.log('✅ conversations.project_id column added.');
      } else {
        console.log('✅ conversations.project_id column already exists.');
      }

      // Backfill project_id from contacts by phone where possible.
      await sequelize.query(`
        UPDATE conversations c
        JOIN (
          SELECT phone, MAX(projectId) AS projectId
          FROM contacts
          WHERE projectId IS NOT NULL
          GROUP BY phone
        ) ct ON ct.phone = c.phone
        SET c.project_id = ct.projectId
        WHERE c.project_id IS NULL
      `);

      const indexes = await queryInterface.showIndex('conversations');
      const hasUniqueProjectPhone = indexes.some((idx) => {
        const fields = (idx.fields || []).map((f) => f.attribute || f.name).filter(Boolean);
        return idx.unique && fields.length === 2 && fields.includes('project_id') && fields.includes('phone');
      });
      if (!hasUniqueProjectPhone) {
        await queryInterface.addIndex('conversations', ['project_id', 'phone'], {
          unique: true,
          name: 'conversations_project_phone_unique'
        });
        console.log('✅ Added conversations unique key on (project_id, phone).');
      }
    } catch (conversationProjectError) {
      console.error('⚠️ conversations project_id ensure error:', conversationProjectError.message);
    }

    // Ensure ClientWhatsApp (clients_whatsapp) table exists for Meta onboarding
    try {
      await ClientWhatsApp.sync({ force: false, alter: true });
      console.log('✅ ClientWhatsApp table verified/created.');
      try {
        const queryInterface = sequelize.getQueryInterface();
        const cwaTable = await queryInterface.describeTable('clients_whatsapp');
        if (!cwaTable.phone) {
          await queryInterface.addColumn('clients_whatsapp', 'phone', {
            type: DataTypes.STRING(20),
            allowNull: true
          });
        }
        if (!cwaTable.project_id) {
          await queryInterface.addColumn('clients_whatsapp', 'project_id', {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null
          });
        }
        const cwaIndexes = await queryInterface.showIndex('clients_whatsapp');
        const hasPhoneIdx = cwaIndexes.some((idx) => {
          const fields = (idx.fields || []).map((f) => f.attribute || f.name).filter(Boolean);
          return fields.length === 1 && fields[0] === 'phone';
        });
        if (!hasPhoneIdx) {
          await queryInterface.addIndex('clients_whatsapp', ['phone'], {
            name: 'clients_whatsapp_phone_idx'
          });
        }
      } catch (cwaSchemaErr) {
        console.error('⚠️ clients_whatsapp schema ensure error:', cwaSchemaErr.message);
      }
    } catch (clientWaError) {
      console.error('⚠️  ClientWhatsApp table sync error:', clientWaError.message);
    }
    // Production SaaS: clients and whatsapp_accounts (multi-tenant)
    try {
      await Client.sync({ force: false, alter: true });
      console.log('✅ Client table verified/created.');
    } catch (clientError) {
      console.error('⚠️  Client table sync error:', clientError.message);
    }
    try {
      await WhatsAppAccount.sync({ force: false, alter: true });
      console.log('✅ WhatsAppAccount table verified/created.');
    } catch (waAccError) {
      console.error('⚠️  WhatsAppAccount table sync error:', waAccError.message);
    }

    try {
      await MetaMessage.sync({ force: false, alter: true });
      console.log('✅ MetaMessage table synced (project scoping).');
    } catch (metaMsgSyncError) {
      console.error('⚠️  MetaMessage table sync error:', metaMsgSyncError.message);
    }

    // Ensure CannedMessage table exists
    try {
      await CannedMessage.sync({ force: false, alter: true });
      console.log('✅ CannedMessage table verified/created.');
    } catch (cannedError) {
      console.error('⚠️  CannedMessage table sync error:', cannedError.message);
    }

    // Ensure Flow table exists
    try {
      await Flow.sync({ force: false, alter: true });
      console.log("✅ Flow table verified/created.");
    } catch (flowError) {
      console.error("⚠️ Flow table sync error:", flowError.message);
    }

    // Ensure PasswordResetToken table exists
    try {
      await PasswordResetToken.sync({ force: false, alter: true });
      console.log('✅ PasswordResetToken table verified/created.');
    } catch (resetTokenError) {
      console.error('⚠️ PasswordResetToken table sync error:', resetTokenError.message);
    }
  } catch (error) {
    console.error('❌ Database synchronization failed:', error.message);
    console.error('Full error:', error);
    // If sync fails, try to continue - tables might already exist
    console.log('⚠️  Continuing anyway - tables may already exist');
  }
};

module.exports = {
  sequelize,
  User,
  Campaign,
  CampaignAudience,
  Contact,
  Template,
  Message,
  Notification,
  InboxMessage,
  ClientWhatsApp,
  Client,
  WhatsAppAccount,
  CannedMessage,
  Flow,
  Account,
  RealConversation,
  PasswordResetToken,
  WebhookLog,
  MetaMessage,
  syncDatabase
};