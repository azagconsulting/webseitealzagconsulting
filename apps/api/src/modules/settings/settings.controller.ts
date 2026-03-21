import { Body, Controller, Get, Put } from '@nestjs/common';

import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateImapSettingsDto } from './dto/update-imap-settings.dto';
import { UpdateWorkspaceSettingsDto } from './dto/update-workspace-settings.dto';
import { UpdateApiSettingsDto } from './dto/update-api-settings.dto';
import { UpdateContactSmtpSettingsDto } from './dto/update-contact-smtp-settings.dto';
import { UpdateAnalysisSettingsDto } from './dto/update-analysis-settings.dto';
import { UpdateOpenAiSettingsDto } from './dto/update-openai-settings.dto';
import { UpdateChatbotOpenAiSettingsDto } from './dto/update-chatbot-openai-settings.dto';
import { UpdateChatbotKnowledgeDto } from './dto/update-chatbot-knowledge.dto';
import { UpdateChatbotLauncherDto } from './dto/update-chatbot-launcher.dto';
import { SettingsService } from './settings.service';

@Controller({
  path: 'settings',
  version: '1',
})
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('smtp')
  getSmtpSettings() {
    return this.settingsService.getSmtpSettings();
  }

  @Put('smtp')
  updateSmtpSettings(@Body() dto: UpdateSmtpSettingsDto) {
    return this.settingsService.updateSmtpSettings(dto);
  }

  @Get('contact-smtp')
  getContactSmtp() {
    return this.settingsService.getContactFormSmtpSettings();
  }

  @Put('contact-smtp')
  updateContactSmtp(@Body() dto: UpdateContactSmtpSettingsDto) {
    return this.settingsService.updateContactFormSmtpSettings(dto);
  }

  @Get('imap')
  getImapSettings() {
    return this.settingsService.getImapSettings();
  }

  @Put('imap')
  updateImapSettings(@Body() dto: UpdateImapSettingsDto) {
    return this.settingsService.updateImapSettings(dto);
  }

  @Get('workspace')
  getWorkspaceSettings() {
    return this.settingsService.getWorkspaceSettings();
  }

  @Put('workspace')
  updateWorkspaceSettings(@Body() dto: UpdateWorkspaceSettingsDto) {
    return this.settingsService.updateWorkspaceSettings(dto);
  }

  @Get('api')
  getApiSettings() {
    return this.settingsService.getApiSettings();
  }

  @Put('api')
  updateApiSettings(@Body() dto: UpdateApiSettingsDto) {
    return this.settingsService.updateApiSettings(dto);
  }

  @Get('analysis')
  getAnalysisSettings() {
    return this.settingsService.getMessageAnalysisSettings();
  }

  @Put('analysis')
  updateAnalysisSettings(@Body() dto: UpdateAnalysisSettingsDto) {
    return this.settingsService.updateMessageAnalysisSettings(dto);
  }

  @Get('openai')
  getOpenAiSettings() {
    return this.settingsService.getOpenAiSettings({ includeSecret: true });
  }

  @Put('openai')
  updateOpenAiSettings(@Body() dto: UpdateOpenAiSettingsDto) {
    return this.settingsService.updateOpenAiSettings(dto);
  }

  @Get('chatbot/openai')
  getChatbotOpenAiSettings() {
    return this.settingsService.getChatbotOpenAiSettings({
      includeSecret: true,
    });
  }

  @Put('chatbot/openai')
  updateChatbotOpenAiSettings(@Body() dto: UpdateChatbotOpenAiSettingsDto) {
    return this.settingsService.updateChatbotOpenAiSettings(dto);
  }

  @Get('chatbot/launcher')
  getChatbotLauncher() {
    return this.settingsService.getChatbotLauncher();
  }

  @Put('chatbot/launcher')
  updateChatbotLauncher(@Body() dto: UpdateChatbotLauncherDto) {
    return this.settingsService.updateChatbotLauncher(dto);
  }

  @Get('chatbot/knowledge')
  getChatbotKnowledge() {
    return this.settingsService.getChatbotKnowledge();
  }

  @Put('chatbot/knowledge')
  updateChatbotKnowledge(@Body() dto: UpdateChatbotKnowledgeDto) {
    return this.settingsService.updateChatbotKnowledge(dto);
  }
}
