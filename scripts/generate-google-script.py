import base64

with open('public/demo-assets/sig_zatybek.png', 'rb') as f:
    b_zatybek = base64.b64encode(f.read()).decode('utf-8')
with open('public/demo-assets/sig_satybaldina.png', 'rb') as f:
    b_satybaldina = base64.b64encode(f.read()).decode('utf-8')
with open('public/demo-assets/stamp.png', 'rb') as f:
    b_stamp = base64.b64encode(f.read()).decode('utf-8')

code = f'''/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script (Версия на русском языке)
 * Для протоколов аналитической лаборатории ТОО «Ecology Expert»
 * 
 * ШАГ 1: ✍️ Поставить подписи и печать (Проверка и перемещение мышкой)
 * ШАГ 2: 🚀 Сохранить в PDF (Автоматическое запоминание позиций и экспорт PDF)
 * =========================================================================
 */

// Встроенные графические ресурсы (Base64) - работают автономно без задержек и внешних запросов
const ASSETS_BASE64 = {{
  sig_zatybek: "{b_zatybek}",
  sig_satybaldina: "{b_satybaldina}",
  stamp: "{b_stamp}"
}};

const CONFIG = {{
  suffix: '_утвержденный',

  // 1-й подписывающий: Инженер-химик Затыбек А. А.
  signer1: {{
    name: 'Затыбек А. А. (Инженер-химик)',
    enabled: true,
    keywords: ['Затыбек', 'Инженер-химик'],
    assetKey: 'sig_zatybek',
    fallbackUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_zatybek.png',
    rowOffset: -1,   // На 1 строку выше (для точной посадки на черту)
    offsetX: 130,    // По горизонтали (центр линии)
    offsetY: 6,      // Положительное смещение (на линию)
    width: 105,
    height: 55
  }},

  // 2-й подписывающий: Заведующий лабораторией Сатыбалдина З. С.
  signer2: {{
    name: 'Сатыбалдина З. С. (Заведующий лабораторией)',
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    assetKey: 'sig_satybaldina',
    fallbackUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    rowOffset: -1,   // На 1 строку выше
    offsetX: 160,    // По горизонтали
    offsetY: 12,     // На линию
    width: 110,
    height: 38
  }},

  // Печать организации: ТОО «Ecology Expert» Для протоколов аналитической лаборатории
  stamp: {{
    name: 'Печать ТОО Ecology Expert',
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    assetKey: 'stamp',
    fallbackUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    rowOffset: -2,   // На 2 строки выше (центр печати делит линию пополам)
    offsetX: 160,    // Смещена вправо с наложением на подпись
    offsetY: 8,      // По вертикали
    width: 95,
    height: 95
  }}
}};

/**
 * Простое меню из 2 основных шагов
 */
function onOpen() {{
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('Шаг 1: ✍️ Поставить подписи и печать', 'step1PlaceSignaturesAndStamp')
    .addItem('Шаг 2: 🚀 Сохранить в PDF', 'step2ExportPdf')
    .addSeparator()
    .addItem('🧹 Убрать подписи и печать', 'clearPlacedSignaturesAndStampsAlert')
    .addItem('🔄 Сбросить позиции (по умолчанию)', 'resetToDefaultCoordsAlert')
    .addSeparator()
    .addItem('🔑 Проверить авторизацию', 'authorizeScript')
    .addToUi();
}}

/**
 * Проверка и разовая авторизация скрипта
 */
function authorizeScript() {{
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    '✅ Авторизация успешна!',
    'Скрипт PDF Stamp Studio готов к работе.\\nТеперь вы можете вызывать меню «📑 PDF Stamp» прямо в таблице!',
    ui.ButtonSet.OK
  );
}}

/**
 * Получение графического объекта (Blob) из Base64 или URL
 */
function getImageBlob(cfg) {{
  if (cfg.assetKey && ASSETS_BASE64[cfg.assetKey]) {{
    try {{
      const bytes = Utilities.base64Decode(ASSETS_BASE64[cfg.assetKey]);
      return Utilities.newBlob(bytes, 'image/png', cfg.assetKey + '.png');
    }} catch (e) {{
      Logger.log('Base64 decode error: ' + e);
    }}
  }}
  const resp = UrlFetchApp.fetch(cfg.fallbackUrl, {{ muteHttpExceptions: true }});
  if (resp.getResponseCode() === 200) {{
    return resp.getBlob();
  }}
  throw new Error('Изображение ' + cfg.name + ' не загрузилось');
}}

/**
 * ШАГ 1: Поставить подписи и печать на лист
 */
function step1PlaceSignaturesAndStamp() {{
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const currentSheet = ss.getActiveSheet();

  try {{
    ss.toast('Размещение подписей и печати...', 'PDF Stamp', 2);
    const count = placeImagesOnSheet(ss);

    if (count === 0) {{
      ui.alert('⚠️ Внимание', 'В таблице не найдены слова «Затыбек» или «Сатыбалдина»!\\nУбедитесь, что открыт лист с протоколом, и повторите.', ui.ButtonSet.OK);
      return;
    }}

    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    forceUiRepaint(ss, currentSheet, cell1);

    ss.toast('✅ Готово! Подписи и печать на месте. При необходимости подвиньте мышкой и нажмите Шаг 2.', 'PDF Stamp', 6);

  }} catch (e) {{
    ui.alert('Ошибка: ' + e.message);
  }}
}}

/**
 * Принудительное безопасное обновление отображения холста Google Sheets
 */
function forceUiRepaint(ss, targetSheet, focusCell) {{
  try {{
    SpreadsheetApp.flush();
    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) {{
      if (sheets[i].getSheetId() !== targetSheet.getSheetId() && !sheets[i].isSheetHidden()) {{
        ss.setActiveSheet(sheets[i]);
        SpreadsheetApp.flush();
        Utilities.sleep(60);
        ss.setActiveSheet(targetSheet);
        SpreadsheetApp.flush();
        break;
      }}
    }}
    if (focusCell) {{
      targetSheet.setActiveRange(focusCell);
    }}
  }} catch (e) {{
    try {{
      if (focusCell) targetSheet.setActiveRange(focusCell);
    }} catch (err) {{}}
  }}
}}

/**
 * ШАГ 2: Сохранить в PDF
 */
function step2ExportPdf() {{
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {{
    const existingCount = countPlacedImages(ss);

    if (existingCount === 0) {{
      ss.toast('Размещение подписей и печати...', 'PDF Stamp', 2);
      placeImagesOnSheet(ss);
      SpreadsheetApp.flush();
      Utilities.sleep(1200);
    }} else {{
      try {{
        autoSaveCurrentPositions(ss);
      }} catch (err) {{}}
      SpreadsheetApp.flush();
      Utilities.sleep(800);
    }}

    ss.toast('Формирование единого PDF документа...', 'PDF Stamp', 4);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName);

  }} catch (error) {{
    ui.alert('Произошла ошибка при экспорте в PDF: ' + error.message);
  }}
}}

/**
 * Размещение изображений на листе
 */
function placeImagesOnSheet(ss) {{
  clearPlacedSignaturesAndStamps();
  let placedCount = 0;

  if (CONFIG.signer1.enabled) {{
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    if (cell1) {{
      const img1 = insertImageOverCell(cell1, 'signer1', CONFIG.signer1);
      if (img1) placedCount++;
    }}
  }}

  if (CONFIG.signer2.enabled) {{
    const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
    if (cell2) {{
      const img2 = insertImageOverCell(cell2, 'signer2', CONFIG.signer2);
      if (img2) placedCount++;
    }}
  }}

  if (CONFIG.stamp.enabled) {{
    const cellStamp = findCellByKeywords(ss, [CONFIG.stamp.anchorKeyword]);
    if (cellStamp) {{
      const imgStamp = insertImageOverCell(cellStamp, 'stamp', CONFIG.stamp);
      if (imgStamp) placedCount++;
    }}
  }}

  return placedCount;
}}

/**
 * Вставка отдельного изображения над ячейкой
 */
function insertImageOverCell(cell, itemKey, defaultCfg) {{
  const sheet = cell.getSheet();
  const blob = getImageBlob(defaultCfg);

  let targetRow = Math.max(1, cell.getRow() + defaultCfg.rowOffset);
  let targetCol = cell.getColumn();
  let offX = Math.max(0, defaultCfg.offsetX);
  let offY = Math.max(0, defaultCfg.offsetY);
  let width = defaultCfg.width;
  let height = defaultCfg.height;

  try {{
    const savedProps = PropertiesService.getDocumentProperties().getProperty('SAVED_COORDS');
    if (savedProps) {{
      const saved = JSON.parse(savedProps);
      if (saved && saved[itemKey]) {{
        const s = saved[itemKey];
        targetRow = Math.max(1, cell.getRow() + (s.deltaRow !== undefined ? s.deltaRow : defaultCfg.rowOffset));
        targetCol = Math.max(1, cell.getColumn() + (s.deltaCol || 0));
        offX = Math.max(0, s.offsetX !== undefined ? s.offsetX : offX);
        offY = Math.max(0, s.offsetY !== undefined ? s.offsetY : offY);
        width = s.width || width;
        height = s.height || height;
      }}
    }}
  }} catch (e) {{}}

  const image = sheet.insertImage(blob, targetCol, targetRow, offX, offY);
  image.setWidth(width);
  image.setHeight(height);
  image.setAltTextDescription('PDF_STAMP_STUDIO_ASSET');
  image.setAltTextTitle(itemKey);

  try {{
    image.setWidth(width + 1);
    image.setWidth(width);
  }} catch (e) {{}}

  return image;
}}

/**
 * Автосохранение позиций при сдвиге мышкой
 */
function autoSaveCurrentPositions(ss) {{
  const sheets = ss.getSheets();
  const saved = {{}};

  sheets.forEach(sheet => {{
    sheet.getImages().forEach(img => {{
      try {{
        if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') {{
          const key = img.getAltTextTitle();
          if (key && CONFIG[key]) {{
            const anchor = img.getAnchorCell();
            const keywordCell = findCellByKeywords(ss, CONFIG[key].keywords || [CONFIG[key].anchorKeyword]);
            let deltaRow = 0;
            let deltaCol = 0;
            if (keywordCell) {{
              deltaRow = anchor.getRow() - keywordCell.getRow();
              deltaCol = anchor.getColumn() - keywordCell.getColumn();
            }}
            saved[key] = {{
              deltaRow: deltaRow,
              deltaCol: deltaCol,
              offsetX: Math.max(0, img.getAnchorCellXOffset() || 0),
              offsetY: Math.max(0, img.getAnchorCellYOffset() || 0),
              width: img.getWidth(),
              height: img.getHeight()
            }};
          }}
        }}
      }} catch (e) {{}}
    }});
  }});

  if (Object.keys(saved).length > 0) {{
    PropertiesService.getDocumentProperties().setProperty('SAVED_COORDS', JSON.stringify(saved));
  }}
}}

/**
 * Сброс координат к значениям по умолчанию
 */
function resetToDefaultCoordsAlert() {{
  PropertiesService.getDocumentProperties().deleteProperty('SAVED_COORDS');
  placeImagesOnSheet(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Сброс выполнен', 'Координаты подписей и печати возвращены к исходным значениям по умолчанию.', SpreadsheetApp.getUi().ButtonSet.OK);
}}

/**
 * Подсчет установленных изображений
 */
function countPlacedImages(ss) {{
  let count = 0;
  ss.getSheets().forEach(sheet => {{
    sheet.getImages().forEach(img => {{
      try {{
        if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') count++;
      }} catch (e) {{}}
    }});
  }});
  return count;
}}

/**
 * Безопасное снятие подписей и печатей с листа
 */
function clearPlacedSignaturesAndStampsAlert() {{
  clearPlacedSignaturesAndStamps();
  SpreadsheetApp.getUi().alert(
    'Подписи и печать убраны',
    'Подписи и печать успешно убраны с листа.\\nВсе данные, формулы и текст таблицы остались нетронутыми.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}}

function clearPlacedSignaturesAndStamps() {{
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  sheets.forEach(sheet => {{
    sheet.getImages().forEach(img => {{
      try {{
        if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') {{
          img.remove();
        }}
      }} catch (e) {{}}
    }});
  }});
  SpreadsheetApp.flush();
}}

/**
 * Поиск ячейки по ключевым словам
 */
function findCellByKeywords(ss, keywords) {{
  const activeSheet = ss.getActiveSheet();
  for (let k = 0; k < keywords.length; k++) {{
    const kw = keywords[k].trim();
    if (!kw) continue;
    const match = activeSheet.createTextFinder(kw).matchEntireCell(false).matchCase(false).findNext();
    if (match) return match;
  }}

  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {{
    const sheet = sheets[i];
    if (sheet.getSheetId() === activeSheet.getSheetId() || sheet.isSheetHidden()) continue;
    for (let k = 0; k < keywords.length; k++) {{
      const kw = keywords[k].trim();
      if (!kw) continue;
      const match = sheet.createTextFinder(kw).matchEntireCell(false).matchCase(false).findNext();
      if (match) return match;
    }}
  }}

  return null;
}}

/**
 * Экспорт всей книги Google Таблицы в один единый PDF
 */
function fetchSpreadsheetPdfBlob(ss) {{
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?' +
    'format=pdf&size=A4&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&fzr=false';
  const res = UrlFetchApp.fetch(url, {{
    headers: {{ 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() }},
    muteHttpExceptions: true
  }});
  if (res.getResponseCode() !== 200) {{
    throw new Error('Не удалось сформировать PDF (HTTP ' + res.getResponseCode() + ')');
  }}
  return res.getBlob();
}}

/**
 * Модальное окно успешного скачивания PDF
 */
function showDownloadDialog(ui, viewUrl, downloadUrl, fileName) {{
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 20px; background: #ffffff; color: #0f172a;">
        <div style="font-size: 38px; margin-bottom: 8px;">🎉</div>
        <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #0f172a;">Документ готов!</h3>
        <p style="margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.4;">
          Подписи и печать установлены, единый PDF файл успешно сформирован.<br>
          <span style="color: #10b981; font-weight: 600;">✨ Новое расположение сохранено для всех следующих документов!</span>
        </p>
        <a href="${{downloadUrl}}" target="_blank"
           style="display: block; background: #2563eb; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; box-shadow: 0 4px 12px rgba(37,99,235,0.25); margin-bottom: 10px;">
          ⬇️ Скачать PDF
        </a>
        <a href="${{viewUrl}}" target="_blank"
           style="display: block; background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500;">
          👁️ Открыть в Google Диске
        </a>
      </body>
    </html>
  `;
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(380).setHeight(250), 'PDF Stamp Studio');
}}
'''

with open('tools/google-sheets-addon/Code.js', 'w', encoding='utf-8') as f:
    f.write(code)

print('Generated Code.js successfully!')
