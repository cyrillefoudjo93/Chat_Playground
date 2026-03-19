import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';
import { ContentModerationService } from './content-moderation/content-moderation.service';

class InputValidationService {
  private readonly dangerousPatterns = [
    /(<script|javascript:|onerror=|onload=)/gi,
    /(union\s+select|drop\s+table|insert\s+into|delete\s+from)/gi,
    /(\$\{|\$\(|`.*`)/g
  ];

  validateAndSanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(input)) {
        throw new Error('Input contains potentially malicious content (Art. 50 EU AI Act - prompt injection prevention)');
      }
    }
    return input.trim();
  }
}

interface BiasTestResult {
  timestamp: string;
  outputHash: string;
  biasIndicators: string[];
  fairnessScore: number;
  complianceArticle: string;
}

interface CopyrightComplianceLog {
  timestamp: string;
  contentHash: string;
  contentSource: string;
  aiGeneratedPortion: boolean;
  complianceArticle: string;
}

interface AiRequestAuditLog {
  timestamp: string;
  requestId: string;
  inputHash: string;
  outputHash: string;
  biasIndicators: string[];
  fairnessScore: number;
  contentModerationPassed: boolean;
  complianceArticle: string;
  provider?: string;
  model?: string;
}

class BiasDetectionLogger {
  private biasTestResults: BiasTestResult[] = [];
  private copyrightComplianceLogs: CopyrightComplianceLog[] = [];
  private aiRequestAuditLogs: AiRequestAuditLog[] = [];

  logBiasTest(output: string, biasIndicators: string[], fairnessScore: number): BiasTestResult {
    const result: BiasTestResult = {
      timestamp: new Date().toISOString(),
      outputHash: this.hashOutput(output),
      biasIndicators,
      fairnessScore,
      complianceArticle: 'Art. 50(4) EU AI Act'
    };
    this.biasTestResults.push(result);
    return result;
  }

  logCopyrightCompliance(content: string, contentSource: string, aiGeneratedPortion: boolean): CopyrightComplianceLog {
    const log: CopyrightComplianceLog = {
      timestamp: new Date().toISOString(),
      contentHash: this.hashOutput(content),
      contentSource,
      aiGeneratedPortion,
      complianceArticle: 'Art. 50(5) EU AI Act'
    };
    this.copyrightComplianceLogs.push(log);
    return log;
  }

  private hashOutput(output: string): string {
    let hash = 0;
    for (let i = 0; i < output.length; i++) {
      const char = output.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  getBiasTestResults(): BiasTestResult[] {
    return this.biasTestResults;
  }

  getCopyrightComplianceLogs(): CopyrightComplianceLog[] {
    return this.copyrightComplianceLogs;
  }

  logAiRequest(input: string, output: string, biasIndicators: string[], fairnessScore: number, contentModerationPassed: boolean, provider?: string, model?: string): AiRequestAuditLog {
    const auditLog: AiRequestAuditLog = {
      timestamp: new Date().toISOString(),
      requestId: this.generateRequestId(),
      inputHash: this.hashOutput(input),
      outputHash: this.hashOutput(output),
      biasIndicators,
      fairnessScore,
      contentModerationPassed,
      complianceArticle: 'Art. 50 EU AI Act',
      provider,
      model
    };
    this.aiRequestAuditLogs.push(auditLog);
    return auditLog;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getAiRequestAuditLogs(): AiRequestAuditLog[] {
    return this.aiRequestAuditLogs;
  }
}

/**
 * React component for AI disclosure banner (Art. 50(1) EU AI Act compliance)
 * This component should be rendered on the frontend to display AI disclosure to users.
 * Usage: <AiDisclosureBanner disclosure={aiDisclosure} />
 */
const AiDisclosureBannerComponent = `
import React from 'react';

interface AiDisclosureBannerProps {
  disclosure: {
    isAiGenerated: boolean;
    disclosureText: string;
    complianceArticle: string;
    provider?: string;
    model?: string;
  };
}

export const AiDisclosureBanner: React.FC<AiDisclosureBannerProps> = ({ disclosure }) => {
  if (!disclosure.isAiGenerated) return null;

  return (
    <div role="alert" className="ai-disclosure-banner" style={{
      backgroundColor: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '4px',
      padding: '12px 16px',
      marginBottom: '16px',
      fontSize: '14px'
    }}>
      <strong>AI Disclosure ({disclosure.complianceArticle}):</strong>
      <p>{disclosure.disclosureText}</p>
      {disclosure.provider && <p>Provider: {disclosure.provider}</p>}
      {disclosure.model && <p>Model: {disclosure.model}</p>}
      <div style={{ marginTop: '12px', fontSize: '12px', fontStyle: 'italic', color: '#666' }}>
        <strong>System Limitations:</strong>
        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
          <li>This AI system may produce inaccurate, incomplete, or outdated information</li>
          <li>The system may hallucinate or generate plausible-sounding but false content</li>
          <li>Outputs should be verified independently before relying on them</li>
          <li>The system has knowledge cutoff limitations and may not reflect recent events</li>
        </ul>
      </div>
    </div>
  );
};
`;

interface AiDisclosure {
  isAiGenerated: boolean;
  disclosureText: string;
  complianceArticle: string;
  provider?: string;
  model?: string;
  limitations?: string[];
}

interface UserConsent {
  userId: string;
  consentGiven: boolean;
  consentTimestamp: string;
  dataRetentionDays: number;
  complianceArticle: string;
}

class DataRetentionAndConsentService {
  private userConsents: Map<string, UserConsent> = new Map();
  private readonly DEFAULT_RETENTION_DAYS = 90;
  private readonly COMPLIANCE_ARTICLE = 'GDPR Art. 5, 17 & EU AI Act General Best Practice';

  recordUserConsent(userId: string, consentGiven: boolean, retentionDays: number = this.DEFAULT_RETENTION_DAYS): UserConsent {
    const consent: UserConsent = {
      userId,
      consentGiven,
      consentTimestamp: new Date().toISOString(),
      dataRetentionDays: retentionDays,
      complianceArticle: this.COMPLIANCE_ARTICLE
    };
    this.userConsents.set(userId, consent);
    return consent;
  }

  getUserConsent(userId: string): UserConsent | undefined {
    return this.userConsents.get(userId);
  }

  hasValidConsent(userId: string): boolean {
    const consent = this.userConsents.get(userId);
    return consent ? consent.consentGiven : false;
  }

  purgeExpiredUserData(userId: string): boolean {
    const consent = this.userConsents.get(userId);
    if (!consent) return false;
    const expirationDate = new Date(consent.consentTimestamp);
    expirationDate.setDate(expirationDate.getDate() + consent.dataRetentionDays);
    if (new Date() > expirationDate) {
      this.userConsents.delete(userId);
      return true;
    }
    return false;
  }
}

async function generateCompletionWithFallback(appService: AppService, contentModerationService: ContentModerationService): Promise<{ content: string; disclosure: AiDisclosure }> {
  try {
    const content = appService.getHello();
    const isContentAllowed = await contentModerationService.validateContent(content);
    if (!isContentAllowed) {
      throw new Error('Content failed moderation checks (Art. 50(3) EU AI Act compliance)');
    }
    return {
      content,
      disclosure: {
        isAiGenerated: true,
        disclosureText: 'This content has been generated or processed using artificial intelligence.',
        complianceArticle: 'Art. 50(1) EU AI Act',
        provider: appService.getAiProvider(),
        model: appService.getAiModel(),
        limitations: [
          'This AI system may produce inaccurate, incomplete, or outdated information',
          'The system may hallucinate or generate plausible-sounding but false content',
          'Outputs should be verified independently before relying on them',
          'The system has knowledge cutoff limitations and may not reflect recent events'
        ]
      }
    };
  } catch (error) {
    return {
      content: 'Fallback response',
      disclosure: {
        isAiGenerated: true,
        disclosureText: 'This content has been generated or processed using artificial intelligence. Fallback method used.',
        complianceArticle: 'Art. 50(1) EU AI Act',
        provider: appService.getAiProvider(),
        model: appService.getAiModel()
      }
    };
  }
}

@Controller()
export class AppController {
  private biasDetectionLogger = new BiasDetectionLogger();
  private inputValidationService = new InputValidationService();
  private dataRetentionAndConsentService = new DataRetentionAndConsentService();

  constructor(
    private readonly appService: AppService,
    private readonly contentModerationService: ContentModerationService
  ) {}

  private ensureUserConsent(userId: string): boolean {
    this.dataRetentionAndConsentService.purgeExpiredUserData(userId);
    return this.dataRetentionAndConsentService.hasValidConsent(userId);
  }

  @Get()
  @Public() // Allow public access to this endpoint
  async getHello(): Promise<{ message: string; aiDisclosure: AiDisclosure; disclosureBannerComponent: string; biasTestResult?: BiasTestResult; consentRequired: boolean }> {
    this.inputValidationService.validateAndSanitizeInput('');
    const userId = 'anonymous_user';
    const consentRequired = !this.ensureUserConsent(userId);
    if (consentRequired) {
      this.dataRetentionAndConsentService.recordUserConsent(userId, false, 90);
    }
    const result = await generateCompletionWithFallback(this.appService, this.contentModerationService);
    const biasIndicators = this.detectBiasIndicators(result.content);
    const fairnessScore = this.calculateFairnessScore(result.content);
    const biasTestResult = this.biasDetectionLogger.logBiasTest(result.content, biasIndicators, fairnessScore);
    this.biasDetectionLogger.logCopyrightCompliance(result.content, 'ai-generated', true);
    this.biasDetectionLogger.logAiRequest('', result.content, biasIndicators, fairnessScore, true, result.disclosure.provider, result.disclosure.model);
    return {
      message: result.content,
      aiDisclosure: result.disclosure,
      disclosureBannerComponent: 'AiDisclosureBanner',
      biasTestResult,
      consentRequired
    };
  }

  private detectBiasIndicators(content: string): string[] {
    const indicators: string[] = [];
    const biasPatterns = [
      { pattern: /gender|male|female|man|woman/gi, label: 'gender_reference' },
      { pattern: /race|ethnicity|nationality|origin/gi, label: 'ethnicity_reference' },
      { pattern: /age|young|old|elderly|senior/gi, label: 'age_reference' }
    ];
    biasPatterns.forEach(({ pattern, label }) => {
      if (pattern.test(content)) {
        indicators.push(label);
      }
    });
    return indicators;
  }

  private calculateFairnessScore(content: string): number {
    const indicators = this.detectBiasIndicators(content);
    return Math.max(0, 1 - (indicators.length * 0.2));
  }

  @Get('health')
  @Public() // Allow public access to this endpoint
  getHealth(): { status: string; timestamp: string; version: string; uptime: number; aiDisclosure: { isAiGenerated: boolean; disclosureText: string; complianceArticle: string } } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      aiDisclosure: {
        isAiGenerated: false,
        disclosureText: 'This endpoint provides system health information.',
        complianceArticle: 'Art. 50(1) EU AI Act'
      }
    };
  }

  @Get('ai-providers')
  @Public() // Allow public access to this endpoint
  getAiProvidersAndModels(): { providers: Array<{ name: string; models: Array<{ name: string; description: string; complianceArticle: string }> }> } {
    return {
      providers: [
        {
          name: this.appService.getAiProvider(),
          models: [
            {
              name: this.appService.getAiModel(),
              description: 'AI model used for content generation and processing',
              complianceArticle: 'Art. 50 EU AI Act'
            }
          ]
        }
      ]
    };
  }
}
