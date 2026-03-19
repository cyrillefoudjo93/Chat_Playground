import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (Art. 50)
// Issue: Keine Mechanismus zur Kennzeichnung von KI-generierten Inhalten oder Angabe des verwendeten KI-Anbieters.
// Suggestion: Erweitern Sie die Rückgabe um Metadaten zum Provider und Modell für die Kennzeichnung von KI-Inhalten.
// ──────────────────────────────────────────────────────────
        return {
          providerId,
          model,
          completion,
          // Art. 50: Offenlegung des KI-Anbieters
          isAIGenerated: true,
          disclaimer: 'Dieser Inhalt wurde von ' + providerId + ' generiert.'
        };

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (Art. 50)
// Issue: Keine dokumentierten Datenschutzrichtlinien für Chat-Daten und Weitergabe an externe KI-Anbieter.
// Suggestion: Erweitern Sie den AuditLogService um Datenschutz-Informationen und Logging der Datenverarbeitung.
// ──────────────────────────────────────────────────────────
  private readonly isGdprCompliant: boolean;
  private readonly retentionPeriodDays: number;
  // Art. 50 + DSGVO: Datenschutzhinweis
  private readonly privacyNotice = 'Ihre Daten werden an externe KI-Anbieter übertragen. Kein Training mit Ihren Daten.';

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (Art. 50)
// Issue: Keine explizite Dokumentation der Verschlüsselung bei Übertragung zu externen KI-Anbietern.
// Suggestion: Dokumentieren Sie HTTPS und fügen Sie Hinweise im Provider-Setup hinzu.
// ──────────────────────────────────────────────────────────
    this.openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
    });
    // Art. 50: Alle Anfragen erfolgen über HTTPS (Helmet + TLS)

// ──────────────────────────────────────────────────────────
// RegulFlow — EU AI Act Compliance Fix (Art. 50)
// Issue: Kein Mechanismus zur visuellen Kennzeichnung von KI-generierten Inhalten in den Ausgaben.
// Suggestion: Fügen Sie ein Prefix oder Metadaten-Flag zu jeder KI-Antwort hinzu.
// ──────────────────────────────────────────────────────────
      let fullResponse = '[KI-generiert] ';

      for await (const chunk of stream) {
