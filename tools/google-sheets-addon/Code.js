/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script (V2 - Диагностикасымен)
 * =========================================================================
 */

const CONFIG = {
  suffix: '_бекітілген',

  // 1-қол қоюшы (Затыбек А. А.)
  signer1: {
    enabled: true,
    keywords: ['Затыбек', 'Инженер-химик'],
    // Google Drive сілтемесі немесе ID-і:
    imageUrl: 'https://drive.google.com/file/d/1mon8QKgwPfQUCVoj26dSJym2_xv_QqjM/view?usp=sharing',
    offsetX: 70,
    offsetY: -15,
    width: 110,
    height: 42
  },

  // 2-қол қоюшы (Сатыбалдина З. С.)
  signer2: {
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    offsetX: 90,
    offsetY: -15,
    width: 110,
    height: 42
  },

  // Мекеме мөрі
  stamp: {
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    offsetX: 35,
    offsetY: -35,
    width: 95,
    height: 95
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('🚀 Қол қойып PDF жасау', 'exportPdfWithSignaturesAndStamp')
    .addItem('🔍 Тексеру (Диагностика)', 'runDiagnostics')
    .addToUi();
}

/**
 * Негізгі экспорттау функциясы
 */
function exportPdfWithSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const report = [];

  // 1. Signer 1 қою
  if (CONFIG.signer1.enabled) {
    const res1 = placeImageOnSheet(ss, CONFIG.signer1, '1-қол қоюшы');
    report.push(res1.msg);
  }

  // 2. Signer 2 қою
  if (CONFIG.signer2.enabled) {
    const res2 = placeImageOnSheet(ss, CONFIG.signer2, '2-қол қоюшы');
    report.push(res2.msg);
  }

  // 3. Мөр қою
  if (CONFIG.stamp.enabled) {
    const resStamp = placeImageOnSheet(ss, {
      ...CONFIG.stamp,
      keywords: [CONFIG.stamp.anchorKeyword]
    }, 'Мекеме мөрі');
    report.push(resStamp.msg);
  }

  SpreadsheetApp.flush();
  Utilities.sleep(1500); // Google кестесіне сурет толық жатып үлгеруі үшін

  // 4. PDF жасау
  try {
    ss.toast('PDF құжаты дайындалуда...', 'PDF Stamp', 5);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName, report.join('<br>'));
  } catch (err) {
    ui.alert('PDF жасау кезінде қате шықты: ' + err.message);
  }
}

/**
 * Кестеге суретті орналастыру (Google Drive-тан тікелей оқу)
 */
function placeImageOnSheet(ss, itemConfig, title) {
  // 1. Ұяшықты іздеу
  const match = findCellByKeywords(ss, itemConfig.keywords);
  if (!match) {
    return {
      success: false,
      msg: `⚠️ <b>${title}:</b> Іздейтін сөздер (${itemConfig.keywords.join(', ')}) кестеден табылмады!`
    };
  }

  // 2. Суретті алу (DriveApp арқылы)
  const blob = getBlobFromUrlOrDrive(itemConfig.imageUrl);
  if (!blob) {
    return {
      success: false,
      msg: `❌ <b>${title}:</b> Сурет жүктелмеді! Google Drive сілтемесін немесе рұқсатын тексеріңіз.`
    };
  }

  const sheet = match.getSheet();
  const image = sheet.insertImage(blob, match.getColumn(), match.getRow(), itemConfig.offsetX, itemConfig.offsetY);
  image.setWidth(itemConfig.width);
  image.setHeight(itemConfig.height);

  return {
    success: true,
    msg: `✅ <b>${title}:</b> «${sheet.getName()}» парағындағы <b>${match.getA1Notation()}</b> ұяшығына қойылды.`
  };
}

/**
 * Google Drive сілтемесінен немесе вебтен Blob алу
 */
function getBlobFromUrlOrDrive(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();

  // Google Drive сілтемесінен ID-ді суырып алу
  let fileId = null;
  const matchDrive = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchDrive && matchDrive[1]) {
    fileId = matchDrive[1];
  } else if (!str.startsWith('http://') && !str.startsWith('https://')) {
    fileId = str;
  }

  if (fileId) {
    try {
      return DriveApp.getFileById(fileId).getBlob();
    } catch (e) {
      Logger.log('DriveApp қатесі: ' + e.message);
    }
  }

  // Егер кәдімгі веб-сілтеме болса (мысалы https://pdf-stamp-studio.../stamp.png)
  try {
    const res = UrlFetchApp.fetch(str, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      return res.getBlob();
    }
  } catch (e) {}

  return null;
}

/**
 * Ұяшықты кілтсөздер бойынша іздеу
 */
function findCellByKeywords(ss, keywords) {
  const sheets = ss.getSheets();
  for (let i = sheets.length - 1; i >= 0; i--) {
    const sheet = sheets[i];
    if (sheet.isSheetHidden()) continue;
    for (let k = 0; k < keywords.length; k++) {
      const kw = keywords[k].trim();
      if (!kw) continue;
      const match = sheet.createTextFinder(kw).matchEntireCell(false).findNext();
      if (match) return match;
    }
  }
  return null;
}

/**
 * Google Sheets кестесін біртұтас PDF Blob ретінде алу
 */
function fetchSpreadsheetPdfBlob(ss) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?' +
    'format=pdf&size=A4&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&fzr=false';
  const res = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  return res.getBlob();
}

/**
 * Жүктеу және есеп терезесі
 */
function showDownloadDialog(ui, viewUrl, downloadUrl, fileName, reportHtml) {
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family:sans-serif; text-align:center; padding:12px; color:#1e293b;">
        <h3 style="color:#0f172a; margin-top:0;">🎉 Құжат дайын!</h3>
        <div style="text-align:left; font-size:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px; margin-bottom:12px; line-height:1.5;">
          ${reportHtml}
        </div>
        <a href="${downloadUrl}" target="_blank" style="display:block; background:#10b981; color:white; padding:10px; border-radius:6px; text-decoration:none; font-weight:bold; margin-bottom:6px;">⬇️ PDF Жүктеп алу</a>
        <a href="${viewUrl}" target="_blank" style="display:block; background:#f1f5f9; color:#334155; padding:8px; border-radius:6px; text-decoration:none; font-size:12px;">👁️ Google Drive-тан қарау</a>
      </body>
    </html>
  `;
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(380).setHeight(270), 'PDF Stamp Studio');
}

/**
 * Диагностика тесті
 */
function runDiagnostics() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const msgs = [];

  // 1-қол
  const m1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
  msgs.push(m1 ? `✅ 1-қол қоюшы сөзі табылды: «${m1.getSheet().getName()}» парағы, ${m1.getA1Notation()}` : `❌ 1-қол қоюшы сөзі (${CONFIG.signer1.keywords.join(', ')}) кестеден ТАБЫЛМАДЫ!`);

  // 2-қол
  const m2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
  msgs.push(m2 ? `✅ 2-қол қоюшы сөзі табылды: «${m2.getSheet().getName()}» парағы, ${m2.getA1Notation()}` : `❌ 2-қол қоюшы сөзі (${CONFIG.signer2.keywords.join(', ')}) кестеден ТАБЫЛМАДЫ!`);

  // Drive суреті
  const b1 = getBlobFromUrlOrDrive(CONFIG.signer1.imageUrl);
  msgs.push(b1 ? `✅ 1-қолтаңба суреті Google Drive-тан сәтті оқылды!` : `❌ 1-қолтаңбаның Google Drive сілтемесі ашылмады!`);

  ui.alert('Диагностика нәтижесі:\n\n' + msgs.join('\n'));
}
