import { VocabularyItem } from '@shared/types';

export class VocabularyService {
  /**
   * 將詞彙表轉換為提示詞格式
   */
  static formatVocabularyForPrompt(vocabularyList?: VocabularyItem[]): string {
    if (!vocabularyList || vocabularyList.length === 0) {
      return '';
    }

    const vocabularyText = vocabularyList
      .map(item => `"${item.incorrect}" 應該是 "${item.correct}"${item.description ? ` (${item.description})` : ''}`)
      .join('\n');

    return `

**重要：專業術語和內部詞彙修正**
在轉錄過程中，請特別注意以下術語的正確拼寫和使用：

${vocabularyText}

請在轉錄時優先使用正確的術語。`;
  }

  /**
   * 解析詞彙表字串（支援多種格式）
   */
  static parseVocabularyString(vocabularyString: string): VocabularyItem[] {
    const items: VocabularyItem[] = [];
    
    if (!vocabularyString.trim()) {
      return items;
    }

    const lines = vocabularyString.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // 支援多種格式：
      // 1. "mtr -> mstr"
      // 2. "mtr => mstr"  
      // 3. "mtr = mstr"
      // 4. "mtr：mstr"
      // 5. "mtr: mstr"
      // 6. "mtr | mstr | 描述"
      
      let incorrect = '';
      let correct = '';
      let description = '';

      if (trimmedLine.includes(' | ')) {
        // 格式: "mtr | mstr | 描述"
        const parts = trimmedLine.split(' | ').map(p => p.trim());
        if (parts.length >= 2) {
          incorrect = parts[0];
          correct = parts[1];
          if (parts.length > 2) {
            description = parts[2];
          }
        }
      } else if (trimmedLine.includes(' -> ')) {
        // 格式: "mtr -> mstr"
        const parts = trimmedLine.split(' -> ').map(p => p.trim());
        if (parts.length === 2) {
          incorrect = parts[0];
          correct = parts[1];
        }
      } else if (trimmedLine.includes(' => ')) {
        // 格式: "mtr => mstr"
        const parts = trimmedLine.split(' => ').map(p => p.trim());
        if (parts.length === 2) {
          incorrect = parts[0];
          correct = parts[1];
        }
      } else if (trimmedLine.includes(' = ')) {
        // 格式: "mtr = mstr"
        const parts = trimmedLine.split(' = ').map(p => p.trim());
        if (parts.length === 2) {
          incorrect = parts[0];
          correct = parts[1];
        }
      } else if (trimmedLine.includes('：')) {
        // 格式: "mtr：mstr"
        const parts = trimmedLine.split('：').map(p => p.trim());
        if (parts.length === 2) {
          incorrect = parts[0];
          correct = parts[1];
        }
      } else if (trimmedLine.includes(': ')) {
        // 格式: "mtr: mstr"
        const parts = trimmedLine.split(': ').map(p => p.trim());
        if (parts.length === 2) {
          incorrect = parts[0];
          correct = parts[1];
        }
      }

      if (incorrect && correct) {
        items.push({ incorrect, correct, description });
      }
    }

    return items;
  }

  /**
   * 將詞彙表轉換為字串格式（用於UI顯示）
   */
  static formatVocabularyToString(vocabularyList?: VocabularyItem[]): string {
    if (!vocabularyList || vocabularyList.length === 0) {
      return '';
    }

    return vocabularyList
      .map(item => {
        if (item.description) {
          return `${item.incorrect} | ${item.correct} | ${item.description}`;
        } else {
          return `${item.incorrect} -> ${item.correct}`;
        }
      })
      .join('\n');
  }

  /**
   * 對轉錄文本應用詞彙表修正
   */
  static applyVocabularyCorrections(text: string, vocabularyList?: VocabularyItem[]): string {
    if (!vocabularyList || vocabularyList.length === 0) {
      return text;
    }

    let correctedText = text;

    for (const item of vocabularyList) {
      // 使用全局替換，不區分大小寫
      const regex = new RegExp(this.escapeRegExp(item.incorrect), 'gi');
      correctedText = correctedText.replace(regex, item.correct);
      
      // 也嘗試替換可能的變體（例如全大寫、首字母大寫等）
      const variations = this.generateVariations(item.incorrect);
      for (const variation of variations) {
        const variationRegex = new RegExp(`\\b${this.escapeRegExp(variation)}\\b`, 'g');
        correctedText = correctedText.replace(variationRegex, item.correct);
      }
    }

    return correctedText;
  }

  /**
   * 轉義正則表達式特殊字符
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 生成詞彙的常見變體
   */
  private static generateVariations(word: string): string[] {
    const variations = new Set<string>();
    
    // 原始詞彙
    variations.add(word);
    
    // 全小寫
    variations.add(word.toLowerCase());
    
    // 全大寫
    variations.add(word.toUpperCase());
    
    // 首字母大寫
    if (word.length > 0) {
      variations.add(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    }
    
    return Array.from(variations);
  }

  /**
   * 驗證詞彙表項目
   */
  static validateVocabularyItem(item: VocabularyItem): boolean {
    return !!(item.incorrect && item.incorrect.trim() && 
              item.correct && item.correct.trim() &&
              item.incorrect !== item.correct);
  }

  /**
   * 清理和去重詞彙表
   */
  static cleanVocabularyList(vocabularyList: VocabularyItem[]): VocabularyItem[] {
    const seenIncorrect = new Set<string>();
    const cleanedList: VocabularyItem[] = [];

    for (const item of vocabularyList) {
      if (this.validateVocabularyItem(item)) {
        const incorrectLower = item.incorrect.toLowerCase();
        if (!seenIncorrect.has(incorrectLower)) {
          seenIncorrect.add(incorrectLower);
          cleanedList.push({
            incorrect: item.incorrect.trim(),
            correct: item.correct.trim(),
            description: item.description?.trim() || undefined
          });
        }
      }
    }

    return cleanedList;
  }
}