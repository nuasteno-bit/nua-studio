; HanKey v1.3 - VS Code 스타일 버전 + 타임스탬프 + 자막 도구
; AutoHotkey v2.0 필요

#SingleInstance Force
#Requires AutoHotkey v2.0
Persistent

; ############################################
; #           VS Code 색상 테마              #
; ############################################
global VSColors := {
    bg: 0x1e1e1e,
    bgSecondary: 0x252526,
    bgTertiary: 0x2d2d30,
    border: 0x464647,
    text: 0xcccccc,
    textSecondary: 0x969696,
    accent: 0x007acc,
    buttonBg: 0x0e639c,
    buttonHover: 0x1177bb,
    success: 0x4ec9b0,
    warning: 0xce9178,
    error: 0xf48771,
    selection: 0x264f78
}

; ############################################
; #           전역 변수 - 기존               #
; ############################################
global speakers := []
global phrases := Map()
global triggerKey := "F3"
global registerKey := "F10"
global deleteWordKey := "F4"
global mainGui := ""
global speakerListView := ""
global phraseListView := ""
global selectedSpeakerIndex := 0
global isCapturingKey := false
global captureTarget := ""
global settingsFile := A_ScriptDir . "\StenoHelper_Settings.ini"
global triggerKeyText := ""
global registerKeyText := ""
global deleteWordKeyText := ""
global chkAutoStart := ""
global chkMinimizeToTray := ""
global chkShowTooltips := ""
global phraseInput := ""
global speakerQuickInput := ""
global insert_pressed_time := 0
global comboThreshold := 3000  
global debugMode := false
global isF4Processing := false
global tabControl := ""

; 팝업창 관련 전역 변수
global speakerPopupGui := ""
global speakerPopupListView := ""
global speakerPopupStatus := ""
global phrasePopupGui := ""
global phrasePopupListView := ""
global phrasePopupStatus := ""

; 화자 형식 설정
global speakerPrefix := "-"
global speakerSuffix := ": "
global speakerAutoNewline := true
global edtPrefix := ""
global edtSuffix := ""
global chkAutoNewline := ""
global lblFormatPreview := ""
global phrasePreview := ""
global btnInsertTab := ""

; 대본 송출 관련 전역 변수
global scriptLines := []
global currentLineIndex := 1
global scriptMode := false
global scriptListView := ""
global lblScriptStatus := ""
global splitMethodDDL := ""
global customCharInput := ""
global chkPunctuation := ""
global chkScriptAutoNewline := ""
global scriptAutoNewline := true
global hiddenEdit := ""
global editingLineIndex := 0
global scriptPopupGui := ""
global scriptPopupListView := ""
global scriptPopupStatus := ""
global scriptSearchInput := ""
global scriptSearchResults := []
global currentSearchIndex := 0

; 팝업창 전용 검색 변수
global scriptPopupSearchInput := ""
global scriptPopupSearchBtn := ""
global scriptPopupSearchPrev := ""
global scriptPopupSearchNext := ""
global scriptPopupSearchResults := []
global currentPopupSearchIndex := 0

; 상태바 관련 변수
global statusBar := ""
global statusDot := ""
global statusText := ""
global speakerCountText := ""
global phraseCountText := ""

; 타임스탬프 관련 전역 변수
global timestampBaseTime := "00:00:00"
global timestampStartTick := 0
global timestampPausedOffset := 0
global timestampRunning := false
global timestampFormat := "[HH:mm:ss]"
global timestampMode := "elapsed"
global lblTimerStatus := ""
global lblElapsedTime := ""
global btnTimerStart := ""
global btnTimerPause := ""
global btnTimerReset := ""
global edtBaseTime := ""
global ddlTimestampFormat := ""
global radioRealtime := ""
global radioElapsed := ""
global radioManual := ""
global timestampListView := ""
global edtSyncOffset := ""
global btnApplyOffset := ""
global btnExportSRT := ""
global chkTimestampNewline := ""
global timestampAutoNewline := false
global chkEnterTimestamp := ""
global enterAutoTimestamp := false

; 타이머 팝업 관련 변수
global timerPopupGui := ""
global timerPopupDisplay := ""
global timerPopupStatus := ""
global timerPopupBtnStart := ""
global timerPopupBtnPause := ""
global timerPopupBtnReset := ""

; 자막 도구 관련 전역 변수
global subtitleLines := []
global subtitleListView := ""
global lblSubtitleStatus := ""
global edtTimeShift := ""
global ddlExportFormat := ""
global edtMergeThreshold := ""
global edtSplitLength := ""
global chkRemoveSilence := ""
global edtMinDuration := ""
global edtMaxCPS := ""
global subtitleSearchInput := ""
global subtitleReplaceInput := ""
global currentSubtitleFile := ""
global subtitleModified := false
global subtitleUndoStack := []
global subtitleRedoStack := []

; 자막 팝업 관련 변수
global subtitlePopupGui := ""
global subtitlePopupListView := ""
global subtitlePopupStatus := ""
global subtitlePopupSearchInput := ""

; 핫키 활성화 상태 변수 추가
global hotkeyStates := Map()
global hotkeySettingsGui := ""

; ############################################
; #           초기화                         #
; ############################################
LoadSettings()
CreateMainGui()
SetupHotkeys()

; ############################################
; #       Insert 조합키 핫키 설정            #
; ############################################
Insert::
NumpadIns:: {
    global insert_pressed_time
    insert_pressed_time := A_TickCount
    ShowModernTooltip("Insert 감지!", 300)
    
    SetTimer(ResetInsertTime, -comboThreshold)
    return
}

WasInsertPressedRecently() {
    global insert_pressed_time, comboThreshold
    if (!GetKeyState("Insert", "P") && insert_pressed_time > 0 && (A_TickCount - insert_pressed_time < comboThreshold)) {
        return true
    }
    return false
}

ResetInsertTime() {
    global insert_pressed_time := 0
}

IsNumber(str) {
    if (str = "") {
        return false
    }
    Loop Parse, str {
        if (A_LoopField < "0" || A_LoopField > "9") {
            return false
        }
    }
    return true
}

#HotIf WasInsertPressedRecently()

$1:: {
    Send("{F13}")
    global insert_pressed_time := 0
    ShowModernTooltip("1→F13 변환!", 500)
}

$2:: {
    Send("{F14}")
    global insert_pressed_time := 0
}

$3:: {
    Send("{F15}")
    global insert_pressed_time := 0
}

$4:: {
    Send("{F16}")
    global insert_pressed_time := 0
}

$5:: {
    Send("{F17}")
    global insert_pressed_time := 0
}

$6:: {
    Send("{F18}")
    global insert_pressed_time := 0
}

$7:: {
    Send("{F19}")
    global insert_pressed_time := 0
}

$8:: {
    Send("{F20}")
    global insert_pressed_time := 0
}

$9:: {
    Send("{F21}")
    global insert_pressed_time := 0
}

#HotIf

#HotIf WasInsertPressedRecently() && !WinActive("ahk_id " . mainGui.Hwnd)
Delete::
NumpadDel::
End::
NumpadEnd::
Numpad1::
Down::
NumpadDown::
Numpad2::
PgDn::
NumpadPgDn::
Numpad3:: {
    ShowModernTooltip("주변키 차단됨", 200)
    return
}
#HotIf

; ############################################
; #       WM_KEYDOWN 메시지 처리             #
; ############################################
WM_KEYDOWN(wParam, lParam, msg, hwnd) {
    if (wParam = 13) {
        if (WinActive("ahk_id " . mainGui.Hwnd)) {
            try {
                focused := mainGui.FocusedCtrl
                
                if (focused = phraseInput) {
                    AddPhrase()
                    return 0
                }
                
                if (focused = speakerQuickInput) {
                    QuickAddSpeakerFromInput()
                    return 0
                }
            }
        }
    }
    return
}

; ############################################
; #           GUI 생성 (VS Code 스타일)      #
; ############################################
CreateMainGUI() {
    global mainGui := Gui("+Resize", "HanKey")
    mainGui.BackColor := Format("{:06X}", VSColors.bg)
    
    ; ===== VS Code 스타일 다크 타이틀바 적용 =====
    ; 윈도우 아이콘 설정
    try {
        iconFile := A_ScriptDir . "\HanKey.ico"
        if (FileExist(iconFile)) {
            mainGui.SetIcon(iconFile)
        } else {
            mainGui.SetIcon("imageres.dll", 174)  ; 키보드 아이콘
        }
    } catch {
        ; 아이콘 설정 실패시 무시
    }
    
    ; Windows 10/11 다크 타이틀바 적용 함수
    ApplyDarkTitleBar(hwnd) {
        try {
            ; Windows 10 버전 1809 이상 다크 모드
            ; A_OSVersion이 "10.0.17763" 이상인지 체크
            osVersion := StrSplit(A_OSVersion, ".")
            if (osVersion.Length >= 3) {
                majorVer := Integer(osVersion[1])
                minorVer := Integer(osVersion[2]) 
                buildVer := Integer(osVersion[3])
                
                ; Windows 10 이상이고 빌드 17763 이상일 때
                if (majorVer >= 10 && buildVer >= 17763) {
                    DllCall("dwmapi\DwmSetWindowAttribute",
                            "Ptr", hwnd,
                            "UInt", 20,  ; DWMWA_USE_IMMERSIVE_DARK_MODE  
                            "Int*", 1,
                            "UInt", 4)
                }
                
                ; Windows 11 (빌드 22000 이상)
                if (majorVer >= 10 && buildVer >= 22000) {
                    ; VS Code 다크 색상
                    titleColor := 0x1E1E1E
                    DllCall("dwmapi\DwmSetWindowAttribute",
                            "Ptr", hwnd,
                            "UInt", 35,  ; DWMWA_CAPTION_COLOR
                            "UInt*", titleColor,
                            "UInt", 4)
                    
                    ; 타이틀바 텍스트 색상 (흰색)
                    textColor := 0xFFFFFF
                    DllCall("dwmapi\DwmSetWindowAttribute",
                            "Ptr", hwnd,
                            "UInt", 36,  ; DWMWA_TEXT_COLOR
                            "UInt*", textColor,
                            "UInt", 4)
                }
            }
        } catch {
            ; DLL 호출 실패시 무시
        }
    }
    ; ===== 다크 타이틀바 설정 끝 =====
    ; 탭 컨트롤
    global tabControl := mainGui.AddTab3("x0 y0 w800 h545", ["화자 관리", "상용구 관리", "대본 송출", "타임스탬프", "자막 도구", "설정"])
    tabControl.SetFont("s10 c" . Format("{:06X}", VSColors.text), "Segoe UI")
    
    ; ===== 화자 관리 탭 =====
    tabControl.UseTab(1)
    
    sectionHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 화자 관리")
    sectionHeader.SetFont("s11 Bold", "Segoe UI")
    
    formatPanel := mainGui.AddText("x20 y75 w760 h85 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    mainGui.AddText("x35 y85 w60 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "접두사:")
    mainGui.SetFont("s9", "Segoe UI")
    global edtPrefix := mainGui.AddEdit("x100 y83 w70 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), speakerPrefix)
    edtPrefix.SetFont("s9", "Consolas")
    edtPrefix.OnEvent("Change", (*) => UpdateSpeakerFormat())
    
    mainGui.AddText("x180 y85 w60 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "접미사:")
    global edtSuffix := mainGui.AddEdit("x245 y83 w70 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), speakerSuffix)
    edtSuffix.SetFont("s9", "Consolas")
    edtSuffix.OnEvent("Change", (*) => UpdateSpeakerFormat())
    
    ; 탭 삽입 버튼
    global btnInsertTab := CreateVSButton(mainGui, 320, 82, 35, 26, "TAB")
    btnInsertTab.OnEvent("Click", InsertTabToSuffix)
    btnInsertTab.SetFont("s8", "Consolas")
    
    mainGui.AddText("x365 y85 w70 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "미리보기:")
    global lblFormatPreview := mainGui.AddText("x440 y83 w165 h24 Center 0x200 Border Background" . Format("{:06X}", VSColors.selection) . " c" . Format("{:06X}", VSColors.accent), "")
    lblFormatPreview.SetFont("s10 Bold", "Consolas")
    UpdateFormatPreview()
    
    global chkAutoNewline := mainGui.AddCheckbox("x35 y115 w300 c" . Format("{:06X}", VSColors.text), "자동 줄바꿈 (화자명 앞에 줄바꿈 추가)")
    chkAutoNewline.SetFont("s9", "Segoe UI")
    chkAutoNewline.Value := speakerAutoNewline
    chkAutoNewline.OnEvent("Click", (*) => UpdateSpeakerFormat())
    
    presetY := 170
    btnFormat1 := CreateVSButton(mainGui, 20, presetY, 90, 28, "-화자: ")
    btnFormat1.OnEvent("Click", (*) => SetSpeakerFormat("-", ": ", true))
    
    btnFormat2 := CreateVSButton(mainGui, 120, presetY, 90, 28, "[화자]")
    btnFormat2.OnEvent("Click", (*) => SetSpeakerFormat("[", "]", true))
    
    btnFormat3 := CreateVSButton(mainGui, 220, presetY, 90, 28, "-(화자)")
    btnFormat3.OnEvent("Click", (*) => SetSpeakerFormat("-(", ")", true))
    
    btnFormat4 := CreateVSButton(mainGui, 320, presetY, 90, 28, "[화자]→탭")
    btnFormat4.OnEvent("Click", (*) => SetSpeakerFormat("[", "]`t", true))
    
    f8Info := mainGui.AddText("x420 y" . (presetY + 5) . " w350 c" . Format("{:06X}", VSColors.warning), "F8: 커서 앞 단어를 화자로 빠르게 등록 (최대 9명)")
    f8Info.SetFont("s9", "Segoe UI")
    
    addY := 210
    mainGui.AddText("x20 y" . (addY + 6) . " w90 c" . Format("{:06X}", VSColors.text), "화자 빠른 추가:")
    mainGui.SetFont("s9", "Segoe UI")
    global speakerQuickInput := mainGui.AddEdit("x115 y" . (addY + 2) . " w320 h26 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    speakerQuickInput.SetFont("s9", "Segoe UI")
    speakerQuickInput.OnEvent("Focus", (*) => speakerQuickInput.Text := "")
    
    OnMessage(0x100, WM_KEYDOWN)
    
    btnQuickAdd := CreateVSButton(mainGui, 445, addY, 60, 26, "추가")
    btnQuickAdd.OnEvent("Click", QuickAddSpeakerFromInput)
    
    mainGui.AddText("x520 y" . (addY + 6) . " w260 c" . Format("{:06X}", VSColors.textSecondary), "(이름 입력 후 Enter 또는 추가 버튼)")
    mainGui.SetFont("s8", "Segoe UI")
    
    speakerLabel := mainGui.AddText("x20 y245 w200 c" . Format("{:06X}", VSColors.text), "화자 목록:")
    speakerLabel.SetFont("s10 Bold", "Segoe UI")
    
    btnSpeakerPopup := CreateVSButton(mainGui, 700, 243, 80, 24, "별도창 ↗")
    btnSpeakerPopup.OnEvent("Click", ShowSpeakerPopup)
    
    global speakerListView := mainGui.AddListView("x20 y270 w760 h140 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["번호", "이름", "단축키", "형식 예시"])
    speakerListView.SetFont("s9", "Segoe UI")
    speakerListView.ModifyCol(1, 60)
    speakerListView.ModifyCol(2, 200)
    speakerListView.ModifyCol(3, 150)
    speakerListView.ModifyCol(4, 320)
    speakerListView.OnEvent("DoubleClick", EditSpeaker)
    
    btnY := 420
    btnAddSpeaker := CreateVSButton(mainGui, 20, btnY, 80, 26, "화자 추가")
    btnAddSpeaker.OnEvent("Click", AddSpeaker)
    
    btnEditSpeaker := CreateVSButton(mainGui, 110, btnY, 80, 26, "수정")
    btnEditSpeaker.OnEvent("Click", EditSpeaker)
    
    btnDeleteSpeaker := CreateVSButton(mainGui, 200, btnY, 80, 26, "삭제")
    btnDeleteSpeaker.OnEvent("Click", DeleteSpeaker)
    
    btnMoveUp := CreateVSButton(mainGui, 290, btnY, 80, 26, "위로")
    btnMoveUp.OnEvent("Click", MoveSpeakerUp)
    
    btnMoveDown := CreateVSButton(mainGui, 380, btnY, 80, 26, "아래로")
    btnMoveDown.OnEvent("Click", MoveSpeakerDown)
    
    btnClearSpeakers := CreateVSButton(mainGui, 680, btnY, 100, 26, "모두 삭제", false, true)
    btnClearSpeakers.OnEvent("Click", ClearAllSpeakers)
    
    ; ===== 상용구 관리 탭 =====
    tabControl.UseTab(2)
    
    phraseHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 상용구 관리")
    phraseHeader.SetFont("s11 Bold", "Segoe UI")
    
    hotkeyPanel := mainGui.AddText("x20 y75 w760 h120 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    mainGui.AddText("x35 y90 w60 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "발동키:")
    mainGui.SetFont("s9", "Segoe UI")
    global triggerKeyText := mainGui.AddText("x100 y87 w80 h26 Center 0x200 Border Background" . Format("{:06X}", VSColors.selection) . " c" . Format("{:06X}", VSColors.accent), triggerKey)
    triggerKeyText.SetFont("s10 Bold", "Consolas")
    btnChangeTrigger := CreateVSButton(mainGui, 190, 86, 55, 28, "변경")
    btnChangeTrigger.OnEvent("Click", (*) => CaptureKey("trigger"))
    
    mainGui.AddText("x260 y90 w500 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "커서 앞 단어를 상용구로 변환")
    
    mainGui.AddText("x35 y125 w60 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "등록키:")
    global registerKeyText := mainGui.AddText("x100 y122 w80 h26 Center 0x200 Border Background" . Format("{:06X}", VSColors.selection) . " c" . Format("{:06X}", VSColors.accent), registerKey)
    registerKeyText.SetFont("s10 Bold", "Consolas")
    btnChangeRegister := CreateVSButton(mainGui, 190, 121, 55, 28, "변경")
    btnChangeRegister.OnEvent("Click", (*) => CaptureKey("register"))
    
    mainGui.AddText("x260 y125 w500 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "에디터에서 상용구 등록")
    
    mainGui.AddText("x35 y160 w60 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "단어삭제:")
    global deleteWordKeyText := mainGui.AddText("x100 y157 w80 h26 Center 0x200 Border Background" . Format("{:06X}", VSColors.selection) . " c" . Format("{:06X}", VSColors.accent), deleteWordKey)
    deleteWordKeyText.SetFont("s10 Bold", "Consolas")
    btnChangeDeleteWord := CreateVSButton(mainGui, 190, 156, 55, 28, "변경")
    btnChangeDeleteWord.OnEvent("Click", (*) => CaptureKey("deleteWord"))
    
    mainGui.AddText("x260 y160 w500 c" . Format("{:06X}", VSColors.text) . " Background" . Format("{:06X}", VSColors.bgSecondary), "단어 단위로 지우기")
    
    btnResetHotkeys := CreateVSButton(mainGui, 700, 156, 70, 28, "초기화")
    btnResetHotkeys.OnEvent("Click", ResetHotkeys)
    
    inputY := 210
    inputLabel := mainGui.AddText("x20 y" . inputY . " w300 c" . Format("{:06X}", VSColors.text), "상용구 등록 (형식: 키:내용)")
    inputLabel.SetFont("s10 Bold", "Segoe UI")
    
    global phraseInput := mainGui.AddEdit("x20 y" . (inputY + 20) . " w640 h28 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    phraseInput.SetFont("s10", "Consolas")
    phraseInput.OnEvent("Change", (*) => UpdatePhrasePreview())
    
    btnAddPhrase := CreateVSButton(mainGui, 670, inputY + 19, 110, 30, "+ 등록", true)
    btnAddPhrase.OnEvent("Click", AddPhrase)
    
    mainGui.AddText("x20 y" . (inputY + 55) . " w60 c" . Format("{:06X}", VSColors.textSecondary), "미리보기:")
    global phrasePreview := mainGui.AddText("x85 y" . (inputY + 55) . " w695 c" . Format("{:06X}", VSColors.accent), "")
    phrasePreview.SetFont("s9", "Consolas")
    
    listY := inputY + 80
    listLabel := mainGui.AddText("x20 y" . listY . " w200 c" . Format("{:06X}", VSColors.text), "등록된 상용구:")
    listLabel.SetFont("s10 Bold", "Segoe UI")
    
    btnPhrasePopup := CreateVSButton(mainGui, 700, listY - 2, 80, 24, "별도창 ↗")
    btnPhrasePopup.OnEvent("Click", ShowPhrasePopup)
    
    global phraseListView := mainGui.AddListView("x20 y" . (listY + 25) . " w760 h120 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["키", "내용", "사용횟수"])
    phraseListView.SetFont("s9", "Segoe UI")
    phraseListView.ModifyCol(1, 100)
    phraseListView.ModifyCol(2, 560)
    phraseListView.ModifyCol(3, 80)
    phraseListView.OnEvent("DoubleClick", EditPhrase)
    
    btnY2 := listY + 155
    btnEditPhrase := CreateVSButton(mainGui, 20, btnY2, 80, 26, "수정")
    btnEditPhrase.OnEvent("Click", EditPhrase)
    
    btnDeletePhrase := CreateVSButton(mainGui, 110, btnY2, 80, 26, "삭제")
    btnDeletePhrase.OnEvent("Click", DeletePhrase)
    
    btnClearPhrases := CreateVSButton(mainGui, 200, btnY2, 100, 26, "모두 삭제", false, true)
    btnClearPhrases.OnEvent("Click", ClearAllPhrases)
    
    btnExportPhrases := CreateVSButton(mainGui, 310, btnY2, 80, 26, "내보내기")
    btnExportPhrases.OnEvent("Click", ExportPhrases)
    
    btnImportPhrases := CreateVSButton(mainGui, 400, btnY2, 80, 26, "불러오기")
    btnImportPhrases.OnEvent("Click", ImportPhrases)
    
    ; ===== 대본 송출 탭 =====
    tabControl.UseTab(3)
    
    scriptHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 대본 송출")
    scriptHeader.SetFont("s11 Bold", "Segoe UI")
    
    scriptInfo := mainGui.AddText("x20 y75 w760 c" . Format("{:06X}", VSColors.textSecondary), "대본을 직접 입력하거나 파일을 열어 한 줄씩 송출할 수 있습니다. (텍스트 파일 드래그&드롭 가능)")
    scriptInfo.SetFont("s9", "Segoe UI")
    
    ctrlY := 100
    btnOpenFile := CreateVSButton(mainGui, 20, ctrlY, 100, 30, "파일 열기", true)
    btnOpenFile.OnEvent("Click", OpenScriptFile)
    
    mainGui.AddText("x130 y" . (ctrlY + 7) . " w40 c" . Format("{:06X}", VSColors.text), "분할:")
    global splitMethodDDL := mainGui.AddDropDownList("x175 y" . (ctrlY + 3) . " w125", ["줄바꿈", "문장 단위", "30자 단위", "40자 단위", "50자 단위", "60자 단위", "구두점 단위", "사용자 지정"])
    splitMethodDDL.Choose(1)
    splitMethodDDL.OnEvent("Change", OnSplitMethodChange)
    
    mainGui.AddText("x310 y" . (ctrlY + 7) . " w30 c" . Format("{:06X}", VSColors.text), "또는")
    global customCharInput := mainGui.AddEdit("x345 y" . (ctrlY + 3) . " w45 h26 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    customCharInput.SetFont("s9", "Segoe UI")
    customCharInput.OnEvent("Change", OnCustomCharChange)
    mainGui.AddText("x395 y" . (ctrlY + 7) . " w20 c" . Format("{:06X}", VSColors.text), "자")
    
    global chkPunctuation := mainGui.AddCheckbox("x425 y" . (ctrlY + 5) . " w115 c" . Format("{:06X}", VSColors.text), "구두점 추가분할")
    chkPunctuation.SetFont("s8", "Segoe UI")
    chkPunctuation.Value := 0
    chkPunctuation.OnEvent("Click", OnPunctuationChange)
    
    global chkScriptAutoNewline := mainGui.AddCheckbox("x425 y" . (ctrlY + 25) . " w115 c" . Format("{:06X}", VSColors.text), "송출 시 자동줄바꿈")
    chkScriptAutoNewline.SetFont("s8", "Segoe UI")
    chkScriptAutoNewline.Value := scriptAutoNewline
    chkScriptAutoNewline.OnEvent("Click", (*) => UpdateScriptAutoNewline())
    
    searchY := ctrlY + 50
    mainGui.AddText("x545 y" . (searchY + 3) . " w35 c" . Format("{:06X}", VSColors.text), "검색:")
    global scriptSearchInput := mainGui.AddEdit("x585 y" . searchY . " w120 h26 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    scriptSearchInput.SetFont("s9", "Segoe UI")
    scriptSearchInput.OnEvent("Change", (*) => SearchScript())
    
    btnSearchPrev := CreateVSButton(mainGui, 710, searchY - 1, 30, 28, "◀")
    btnSearchPrev.OnEvent("Click", SearchPrevious)
    
    btnSearchNext := CreateVSButton(mainGui, 745, searchY - 1, 30, 28, "▶")
    btnSearchNext.OnEvent("Click", SearchNext)
    
    btnToggleMode := CreateVSButton(mainGui, 545, ctrlY, 90, 30, "대본 모드")
    btnToggleMode.OnEvent("Click", ToggleScriptMode)
    
    btnClearScript := CreateVSButton(mainGui, 640, ctrlY, 60, 30, "지우기", false, true)
    btnClearScript.OnEvent("Click", ClearScript)
    
    btnAddLine := CreateVSButton(mainGui, 705, ctrlY, 35, 30, "+줄")
    btnAddLine.OnEvent("Click", AddScriptLine)
    
    btnDeleteLine := CreateVSButton(mainGui, 745, ctrlY, 35, 30, "-줄")
    btnDeleteLine.OnEvent("Click", DeleteScriptLine)
    
    listLabel2 := mainGui.AddText("x20 y" . (searchY + 35) . " w200 c" . Format("{:06X}", VSColors.text), "송출 목록:")
    listLabel2.SetFont("s10 Bold", "Segoe UI")
    
    btnScriptPopup := CreateVSButton(mainGui, 700, searchY + 33, 80, 24, "별도창 ↗")
    btnScriptPopup.OnEvent("Click", ShowScriptPopup)
    
    global scriptListView := mainGui.AddListView("x20 y" . (searchY + 60) . " w760 h170 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000 +LV0x1", ["번호", "상태", "내용"])
    scriptListView.SetFont("s9", "Segoe UI")
    scriptListView.ModifyCol(1, 60)
    scriptListView.ModifyCol(2, 60)
    scriptListView.ModifyCol(3, 620)
    scriptListView.OnEvent("DoubleClick", EditScriptLine)
    scriptListView.OnEvent("Click", OnScriptListClick)
    
    global hiddenEdit := mainGui.AddEdit("x0 y0 w0 h0 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    hiddenEdit.OnEvent("LoseFocus", FinishEditScriptLine)
    
    global lblScriptStatus := mainGui.AddText("x20 y375 w400 h25 c" . Format("{:06X}", VSColors.text), "대본 모드: OFF")
    lblScriptStatus.SetFont("s11 Bold", "Segoe UI")
    
    usage1 := mainGui.AddText("x20 y405 w760 c" . Format("{:06X}", VSColors.textSecondary), "Ctrl+Numpad7: 대본 모드 | Ctrl+Numpad5: 현재 줄 송출 | Ctrl+Numpad8: 이전 줄 | Ctrl+Numpad2: 다음 줄 | Ctrl+Numpad9: 자동줄바꿈")
    usage1.SetFont("s8", "Segoe UI")
; ===== 타임스탬프 탭 =====
    tabControl.UseTab(4)
    
    timestampHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 타임스탬프")
    timestampHeader.SetFont("s11 Bold", "Segoe UI")
    
    modePanel := mainGui.AddText("x20 y75 w760 h60 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    mainGui.AddText("x35 y85 w60 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "모드:")
    mainGui.SetFont("s9", "Segoe UI")
    
    global radioRealtime := mainGui.AddRadio("x100 y85 w100 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "실시간")
    radioRealtime.OnEvent("Click", (*) => SetTimestampMode("realtime"))
    
    global radioElapsed := mainGui.AddRadio("x210 y85 w100 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " Checked", "경과시간")
    radioElapsed.OnEvent("Click", (*) => SetTimestampMode("elapsed"))
    
    global radioManual := mainGui.AddRadio("x320 y85 w100 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "수동설정")
    radioManual.OnEvent("Click", (*) => SetTimestampMode("manual"))
    
    mainGui.AddText("x35 y110 w60 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "기준시간:")
    global edtBaseTime := mainGui.AddEdit("x100 y108 w100 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), timestampBaseTime)
    edtBaseTime.SetFont("s9", "Consolas")
    edtBaseTime.OnEvent("Change", (*) => OnBaseTimeChange())
    
    btnSetCurrent := CreateVSButton(mainGui, 210, 107, 60, 24, "현재")
    btnSetCurrent.OnEvent("Click", SetCurrentTime)
    
    btnSetZero := CreateVSButton(mainGui, 280, 107, 60, 24, "00:00")
    btnSetZero.OnEvent("Click", (*) => SetBaseTime("00:00:00"))
    
    mainGui.AddText("x360 y110 w40 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "형식:")
    global ddlTimestampFormat := mainGui.AddDropDownList("x405 y108 w150", ["[HH:mm:ss]", "(HH:mm:ss)", "HH:mm:ss -", "HH시mm분ss초", "[mm:ss]", "(mm:ss)"])
    ddlTimestampFormat.Choose(1)
    ddlTimestampFormat.OnEvent("Change", (*) => UpdateTimestampFormat())
    
    global chkTimestampNewline := mainGui.AddCheckbox("x570 y108 w180 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "타임스탬프 후 자동 줄바꿈")
    chkTimestampNewline.SetFont("s9", "Segoe UI")
    chkTimestampNewline.Value := timestampAutoNewline
    chkTimestampNewline.OnEvent("Click", (*) => UpdateTimestampNewline())
    
    global chkEnterTimestamp := mainGui.AddCheckbox("x570 y130 w180 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "Enter 시 자동 타임스탬프")
    chkEnterTimestamp.SetFont("s9", "Segoe UI")
    chkEnterTimestamp.Value := enterAutoTimestamp
    chkEnterTimestamp.OnEvent("Click", (*) => UpdateEnterTimestamp())
    
    timerPanel := mainGui.AddText("x20 y145 w760 h80 Background" . Format("{:06X}", VSColors.bgTertiary), "")
    
    timerTitle := mainGui.AddText("x35 y155 w100 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text), "타이머 제어:")
    timerTitle.SetFont("s10 Bold", "Segoe UI")
    
    global btnTimerStart := CreateVSButton(mainGui, 140, 153, 80, 28, "▶ 시작", true)
    btnTimerStart.OnEvent("Click", StartTimer)
    
    global btnTimerPause := CreateVSButton(mainGui, 230, 153, 80, 28, "⏸ 일시정지")
    btnTimerPause.OnEvent("Click", PauseTimer)
    
    global btnTimerReset := CreateVSButton(mainGui, 320, 153, 80, 28, "⏹ 리셋")
    btnTimerReset.OnEvent("Click", ResetTimer)
    
    btnTimerPopup := CreateVSButton(mainGui, 410, 153, 100, 28, "타이머 별도창", true)
    btnTimerPopup.OnEvent("Click", ShowTimerPopup)
    
    global lblElapsedTime := mainGui.AddText("x520 y155 w150 h28 Center 0x200 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.accent) . " Border", "00:00:00")
    lblElapsedTime.SetFont("s14 Bold", "Consolas")
    
    global lblTimerStatus := mainGui.AddText("x35 y190 w300 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text), "상태: 정지")
    lblTimerStatus.SetFont("s9", "Segoe UI")
    
    timestampHotkey := mainGui.AddText("x350 y190 w400 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.accent), "F2: 타임스탬프 | F11: 타이머 | Enter: 자동 타임스탬프 (체크 시)")
    timestampHotkey.SetFont("s9 Bold", "Segoe UI")
    
    recordTitle := mainGui.AddText("x20 y235 w200 c" . Format("{:06X}", VSColors.text), "타임스탬프 기록:")
    recordTitle.SetFont("s10 Bold", "Segoe UI")
    
    btnClearRecords := CreateVSButton(mainGui, 700, 233, 80, 24, "지우기")
    btnClearRecords.OnEvent("Click", ClearTimestampRecords)
    
    global timestampListView := mainGui.AddListView("x20 y260 w760 h180 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["번호", "시간", "메모"])
    timestampListView.SetFont("s9", "Segoe UI")
    timestampListView.ModifyCol(1, 60)
    timestampListView.ModifyCol(2, 150)
    timestampListView.ModifyCol(3, 530)
    
    srtPanel := mainGui.AddText("x20 y450 w760 h60 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    srtTitle := mainGui.AddText("x35 y460 w100 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "SRT 도구:")
    srtTitle.SetFont("s10 Bold", "Segoe UI")
    
    mainGui.AddText("x140 y463 w70 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "시간 조정:")
    global edtSyncOffset := mainGui.AddEdit("x215 y460 w60 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "0")
    edtSyncOffset.SetFont("s9", "Consolas")
    
    mainGui.AddText("x280 y463 w20 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "초")
    
    global btnApplyOffset := CreateVSButton(mainGui, 310, 459, 80, 26, "전체 적용")
    btnApplyOffset.OnEvent("Click", ApplyTimeOffset)
    
    global btnExportSRT := CreateVSButton(mainGui, 400, 459, 100, 26, "SRT 내보내기", true)
    btnExportSRT.OnEvent("Click", ExportToSRT)
    
    btnExportVTT := CreateVSButton(mainGui, 510, 459, 100, 26, "VTT 내보내기")
    btnExportVTT.OnEvent("Click", ExportToVTT)
    
    mainGui.AddText("x35 y488 w700 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.textSecondary), "팁: 대본 송출 탭의 내용에 타임스탬프가 있으면 자동으로 SRT로 변환됩니다.")
    mainGui.SetFont("s8", "Segoe UI")
    
    ; ===== 자막 도구 탭 =====
    tabControl.UseTab(5)
    
    subtitleHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 자막 도구")
    subtitleHeader.SetFont("s11 Bold", "Segoe UI")
    
    subtitleInfo := mainGui.AddText("x20 y75 w760 c" . Format("{:06X}", VSColors.textSecondary), "자막 파일을 열어 편집, 시간 조정, 포맷 변환 등을 수행할 수 있습니다.")
    subtitleInfo.SetFont("s9", "Segoe UI")
    
    filePanel := mainGui.AddText("x20 y100 w760 h40 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    btnOpenSubtitle := CreateVSButton(mainGui, 30, 107, 100, 26, "파일 열기", true)
    btnOpenSubtitle.OnEvent("Click", OpenSubtitleFile)
    
    btnSaveSubtitle := CreateVSButton(mainGui, 140, 107, 80, 26, "저장")
    btnSaveSubtitle.OnEvent("Click", SaveSubtitleFile)
    
    btnSaveAsSubtitle := CreateVSButton(mainGui, 230, 107, 100, 26, "다른이름 저장")
    btnSaveAsSubtitle.OnEvent("Click", SaveAsSubtitleFile)
    
    global lblSubtitleStatus := mainGui.AddText("x350 y110 w420 c" . Format("{:06X}", VSColors.text), "파일 없음")
    lblSubtitleStatus.SetFont("s9", "Segoe UI")
    
    timePanel := mainGui.AddText("x20 y150 w370 h80 Background" . Format("{:06X}", VSColors.bgTertiary), "")
    
    timeTitle := mainGui.AddText("x30 y158 w100 c" . Format("{:06X}", VSColors.text), "시간 조작:")
    timeTitle.SetFont("s10 Bold", "Segoe UI")
    
    mainGui.AddText("x30 y182 w60 c" . Format("{:06X}", VSColors.text), "전체 조정:")
    global edtTimeShift := mainGui.AddEdit("x95 y180 w60 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "0")
    edtTimeShift.SetFont("s9", "Consolas")
    
    mainGui.AddText("x160 y182 w20 c" . Format("{:06X}", VSColors.text), "초")
    
    btnApplyTimeShift := CreateVSButton(mainGui, 190, 178, 80, 24, "적용")
    btnApplyTimeShift.OnEvent("Click", ApplySubtitleTimeShift)
    
    btnSyncFirst := CreateVSButton(mainGui, 280, 178, 100, 24, "첫 자막 동기화")
    btnSyncFirst.OnEvent("Click", SyncFirstSubtitle)
    
    mainGui.AddText("x30 y206 w350 c" . Format("{:06X}", VSColors.textSecondary), "음수 입력 시 시간이 앞당겨집니다. (예: -2.5)")
    mainGui.SetFont("s8", "Segoe UI")
    
    editPanel := mainGui.AddText("x400 y150 w380 h80 Background" . Format("{:06X}", VSColors.bgTertiary), "")
    
    editTitle := mainGui.AddText("x410 y158 w100 c" . Format("{:06X}", VSColors.text), "자막 편집:")
    editTitle.SetFont("s10 Bold", "Segoe UI")
    
    btnMergeSubtitles := CreateVSButton(mainGui, 410, 178, 80, 24, "자막 병합")
    btnMergeSubtitles.OnEvent("Click", MergeSubtitles)
    
    btnSplitSubtitles := CreateVSButton(mainGui, 500, 178, 80, 24, "자막 분할")
    btnSplitSubtitles.OnEvent("Click", SplitSubtitles)
    
    btnCheckCPS := CreateVSButton(mainGui, 590, 178, 80, 24, "CPS 검사")
    btnCheckCPS.OnEvent("Click", CheckSubtitleCPS)
    
    btnFixOverlap := CreateVSButton(mainGui, 680, 178, 90, 24, "겹침 수정")
    btnFixOverlap.OnEvent("Click", FixOverlappingSubtitles)
    
    mainGui.AddText("x410 y206 w350 c" . Format("{:06X}", VSColors.textSecondary), "CPS: 초당 글자수 (권장: 15-20)")
    mainGui.SetFont("s8", "Segoe UI")
    
    searchPanel := mainGui.AddText("x20 y240 w760 h35 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    mainGui.AddText("x30 y248 w35 c" . Format("{:06X}", VSColors.text), "찾기:")
    global subtitleSearchInput := mainGui.AddEdit("x70 y246 w150 h22 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    subtitleSearchInput.SetFont("s9", "Segoe UI")
    
    mainGui.AddText("x230 y248 w45 c" . Format("{:06X}", VSColors.text), "바꾸기:")
    global subtitleReplaceInput := mainGui.AddEdit("x280 y246 w150 h22 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    subtitleReplaceInput.SetFont("s9", "Segoe UI")
    
    btnFindNext := CreateVSButton(mainGui, 440, 245, 60, 24, "다음")
    btnFindNext.OnEvent("Click", FindNextSubtitle)
    
    btnReplaceOne := CreateVSButton(mainGui, 510, 245, 60, 24, "바꾸기")
    btnReplaceOne.OnEvent("Click", ReplaceOneSubtitle)
    
    btnReplaceAll := CreateVSButton(mainGui, 580, 245, 80, 24, "모두 바꾸기")
    btnReplaceAll.OnEvent("Click", ReplaceAllSubtitles)
    
    btnUndo := CreateVSButton(mainGui, 670, 245, 50, 24, "↶ 실행취소")
    btnUndo.OnEvent("Click", UndoSubtitleChange)
    
    btnRedo := CreateVSButton(mainGui, 725, 245, 50, 24, "↷ 재실행")
    btnRedo.OnEvent("Click", RedoSubtitleChange)
    
    listTitle := mainGui.AddText("x20 y285 w200 c" . Format("{:06X}", VSColors.text), "자막 목록:")
    listTitle.SetFont("s10 Bold", "Segoe UI")
    
    btnSubtitlePopup := CreateVSButton(mainGui, 550, 283, 80, 24, "별도창 ↗")
    btnSubtitlePopup.OnEvent("Click", ShowSubtitlePopup)
    
    btnAddSubtitle := CreateVSButton(mainGui, 635, 283, 45, 24, "+추가")
    btnAddSubtitle.OnEvent("Click", AddSubtitleLine)
    
    btnDeleteSubtitle := CreateVSButton(mainGui, 685, 283, 45, 24, "-삭제")
    btnDeleteSubtitle.OnEvent("Click", DeleteSubtitleLine)
    
    btnClearSubtitles := CreateVSButton(mainGui, 735, 283, 45, 24, "지우기")
    btnClearSubtitles.OnEvent("Click", ClearSubtitles)
    
    global subtitleListView := mainGui.AddListView("x20 y310 w760 h180 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["번호", "시작", "종료", "지속", "CPS", "내용"])
    subtitleListView.SetFont("s9", "Segoe UI")
    subtitleListView.ModifyCol(1, 50)
    subtitleListView.ModifyCol(2, 80)
    subtitleListView.ModifyCol(3, 80)
    subtitleListView.ModifyCol(4, 50)
    subtitleListView.ModifyCol(5, 45)
    subtitleListView.ModifyCol(6, 445)
    subtitleListView.OnEvent("DoubleClick", EditSubtitleLine)
    
    formatPanel := mainGui.AddText("x20 y500 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    mainGui.AddText("x30 y507 w80 c" . Format("{:06X}", VSColors.text), "내보내기 형식:")
    
    global ddlExportFormat := mainGui.AddDropDownList("x115 y505 w120", ["SRT", "VTT (WebVTT)", "ASS/SSA", "SBV (YouTube)", "TXT (텍스트)"])
    ddlExportFormat.Choose(1)
    
    btnExportSubtitle := CreateVSButton(mainGui, 245, 504, 100, 24, "내보내기", true)
    btnExportSubtitle.OnEvent("Click", ExportSubtitle)
    
    btnImportFromScript := CreateVSButton(mainGui, 355, 504, 120, 24, "대본에서 가져오기")
    btnImportFromScript.OnEvent("Click", ImportFromScript)
    
    mainGui.AddText("x490 y507 w280 c" . Format("{:06X}", VSColors.textSecondary), "대본 송출 탭의 타임스탬프 내용을 자막으로 변환")
    mainGui.SetFont("s8", "Segoe UI")
    
    ; ===== 설정 탭 =====
    tabControl.UseTab(6)
    
    settingsHeader := mainGui.AddText("x20 y40 w760 h30 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", " 설정")
    settingsHeader.SetFont("s11 Bold", "Segoe UI")
    
    global chkAutoStart := mainGui.AddCheckbox("x30 y85 w400 c" . Format("{:06X}", VSColors.text), "Windows 시작 시 자동 실행")
    chkAutoStart.SetFont("s9", "Segoe UI")
    chkAutoStart.OnEvent("Click", ToggleAutoStart)
    
    global chkMinimizeToTray := mainGui.AddCheckbox("x30 y115 w400 c" . Format("{:06X}", VSColors.text), "닫기 버튼 클릭 시 트레이로 최소화")
    chkMinimizeToTray.SetFont("s9", "Segoe UI")
    
    global chkShowTooltips := mainGui.AddCheckbox("x30 y145 w400 c" . Format("{:06X}", VSColors.text), "상용구 변환 시 툴팁 표시")
    chkShowTooltips.SetFont("s9", "Segoe UI")
    chkShowTooltips.Value := 1
    
    backupPanel := mainGui.AddText("x20 y185 w760 h90 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    backupTitle := mainGui.AddText("x35 y195 w200 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text) . " 0x200", "백업 관리")
    backupTitle.SetFont("s10 Bold", "Segoe UI")
    
    backupInfo := mainGui.AddText("x35 y215 w700 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.textSecondary), "설정과 데이터를 백업하거나 복원할 수 있습니다.")
    backupInfo.SetFont("s8", "Segoe UI")
    
    btnBackup := CreateVSButton(mainGui, 35, 235, 130, 30, "백업 생성")
    btnBackup.OnEvent("Click", CreateBackup)
    
    btnRestore := CreateVSButton(mainGui, 175, 235, 130, 30, "백업 복원")
    btnRestore.OnEvent("Click", RestoreBackup)
    
    btnResetSettings := CreateVSButton(mainGui, 35, 295, 150, 30, "설정 초기화", false, true)
    btnResetSettings.OnEvent("Click", ResetSettings)
    
    ; 핫키 설정 버튼 추가
    btnHotkeySettings := CreateVSButton(mainGui, 195, 295, 100, 30, "핫키 설정", true)
    btnHotkeySettings.OnEvent("Click", ShowHotkeySettings)
    
    infoY := 345
    compatInfo := mainGui.AddText("x30 y" . infoY . " w740 c" . Format("{:06X}", VSColors.textSecondary), "지원: 메모장, 워드패드, MS Word, 한글(HWP), VS Code, 쉐어타이핑 등")
    compatInfo.SetFont("s8", "Segoe UI")
    
    contactLabel := mainGui.AddText("x30 y" . (infoY + 20) . " w100 c" . Format("{:06X}", VSColors.text), "의견/버그 신고: ")
    contactLabel.SetFont("s8 Bold", "Segoe UI")
    contactEmail := mainGui.AddText("x130 y" . (infoY + 20) . " w200 c" . Format("{:06X}", VSColors.accent), "hanma001@naver.com")
    contactEmail.SetFont("s8", "Segoe UI")
    
    ; ===== 상태바 =====
    tabControl.UseTab()
    
    global statusBar := mainGui.AddText("x0 y545 w800 h35 Background" . Format("{:06X}", VSColors.bgSecondary), "")
    
    global statusDot := mainGui.AddText("x15 y556 w10 h10 0x200 Background" . Format("{:06X}", VSColors.success), "")
    global statusText := mainGui.AddText("x30 y554 w150 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.text), "Ready")
    statusText.SetFont("s9", "Segoe UI")
    
    global speakerCountText := mainGui.AddText("x200 y554 w120 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.textSecondary), "화자: 0/9")
    speakerCountText.SetFont("s9", "Segoe UI")
    
    global phraseCountText := mainGui.AddText("x330 y554 w120 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.textSecondary), "상용구: 0개")
    phraseCountText.SetFont("s9", "Segoe UI")
    
    btnSave := CreateVSButton(mainGui, 580, 550, 85, 25, "저장", true)
    btnSave.OnEvent("Click", SaveSettings)
    
    btnCloseMain := CreateVSButton(mainGui, 675, 550, 85, 25, "닫기")
    btnCloseMain.OnEvent("Click", (*) => CloseOrMinimize())
    
    mainGui.OnEvent("Close", (*) => CloseOrMinimize())
    mainGui.OnEvent("DropFiles", OnDropFiles)
    
    UpdateSpeakerList()
    UpdatePhraseList()
    
    SetTimer(UpdateElapsedTime, 100)
    
     mainGui.Show("w800 h580")
    
    ; 윈도우가 표시된 후 다크 타이틀바 적용
    ApplyDarkTitleBar(mainGui.Hwnd)
}

; ############################################
; #      핫키 설정 GUI - 수정된 부분         #
; ############################################
ShowHotkeySettings(*) {
    if (IsObject(hotkeySettingsGui) && hotkeySettingsGui.Hwnd) {
        hotkeySettingsGui.Show()
        return
    }
    
    global hotkeySettingsGui := Gui("+Owner" . mainGui.Hwnd, "핫키 설정")
    hotkeySettingsGui.BackColor := Format("{:06X}", VSColors.bg)
    
    hotkeySettingsGui.AddText("x10 y10 w300 c" . Format("{:06X}", VSColors.text), "각 핫키의 활성화/비활성화를 설정할 수 있습니다.")
    hotkeySettingsGui.SetFont("s9", "Segoe UI")
    
    ; 핫키 체크박스들
    y := 40
    
    global chkHotkeyInsert := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "Insert+숫자 → F13~F21 변환")
    chkHotkeyInsert.Value := Integer(IniRead(settingsFile, "HotkeyStates", "InsertCombo", 1))
    chkHotkeyInsert.OnEvent("Click", (*) => ToggleHotkey("InsertCombo", chkHotkeyInsert.Value))
    
    y += 25
    global chkHotkeyF8 := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "F8: 빠른 화자 등록")
    chkHotkeyF8.Value := Integer(IniRead(settingsFile, "HotkeyStates", "F8", 1))
    chkHotkeyF8.OnEvent("Click", (*) => ToggleHotkey("F8", chkHotkeyF8.Value))
    
    y += 25
    global chkHotkeyF2 := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "F2: 타임스탬프 삽입")
    chkHotkeyF2.Value := Integer(IniRead(settingsFile, "HotkeyStates", "F2", 1))
    chkHotkeyF2.OnEvent("Click", (*) => ToggleHotkey("F2", chkHotkeyF2.Value))
    
    y += 25
    global chkHotkeyF11 := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "F11: 타이머 토글")
    chkHotkeyF11.Value := Integer(IniRead(settingsFile, "HotkeyStates", "F11", 1))
    chkHotkeyF11.OnEvent("Click", (*) => ToggleHotkey("F11", chkHotkeyF11.Value))
    
    y += 25
    global chkHotkeyScriptMode := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "Ctrl+Numpad7: 대본 모드 토글")
    chkHotkeyScriptMode.Value := Integer(IniRead(settingsFile, "HotkeyStates", "ScriptMode", 1))
    chkHotkeyScriptMode.OnEvent("Click", (*) => ToggleHotkey("ScriptMode", chkHotkeyScriptMode.Value))
    
    y += 25
    global chkHotkeyScriptSend := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "Ctrl+Numpad5: 대본 송출")
    chkHotkeyScriptSend.Value := Integer(IniRead(settingsFile, "HotkeyStates", "ScriptSend", 1))
    chkHotkeyScriptSend.OnEvent("Click", (*) => ToggleHotkey("ScriptSend", chkHotkeyScriptSend.Value))
    
    y += 25
    global chkHotkeyScriptNav := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "Ctrl+Numpad2/8: 대본 이동")
    chkHotkeyScriptNav.Value := Integer(IniRead(settingsFile, "HotkeyStates", "ScriptNav", 1))
    chkHotkeyScriptNav.OnEvent("Click", (*) => ToggleHotkey("ScriptNav", chkHotkeyScriptNav.Value))
    
    y += 25
    global chkHotkeyScriptNewline := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "Ctrl+Numpad9: 자동줄바꿈 토글")
    chkHotkeyScriptNewline.Value := Integer(IniRead(settingsFile, "HotkeyStates", "ScriptNewline", 1))
    chkHotkeyScriptNewline.OnEvent("Click", (*) => ToggleHotkey("ScriptNewline", chkHotkeyScriptNewline.Value))
    
    y += 25
    global chkHotkeyEnterTimestamp := hotkeySettingsGui.AddCheckbox("x10 y" . y . " w300 c" . Format("{:06X}", VSColors.text), "Enter: 자동 타임스탬프")
    chkHotkeyEnterTimestamp.Value := Integer(IniRead(settingsFile, "HotkeyStates", "EnterTimestamp", 1))
    chkHotkeyEnterTimestamp.OnEvent("Click", (*) => ToggleHotkey("EnterTimestamp", chkHotkeyEnterTimestamp.Value))
    
    y += 35
    btnClose := CreateVSButton(hotkeySettingsGui, 120, y, 80, 28, "닫기")
    btnClose.OnEvent("Click", CloseHotkeySettings)
    
    hotkeySettingsGui.OnEvent("Close", CloseHotkeySettings)
    hotkeySettingsGui.Show("w320 h" . (y + 40))
}

; 핫키 설정 GUI 닫기 함수 추가
CloseHotkeySettings(*) {
    global hotkeySettingsGui
    if (IsObject(hotkeySettingsGui) && hotkeySettingsGui.Hwnd) {
        hotkeySettingsGui.Destroy()
    }
    hotkeySettingsGui := ""
}

ToggleHotkey(hotkeyName, state) {
    IniWrite(state, settingsFile, "HotkeyStates", hotkeyName)
    
    ; 즉시 적용
    if (hotkeyName = "F8") {
        try {
            if (state) {
                Hotkey("F8", QuickAddSpeaker)
            } else {
                Hotkey("F8", "Off")
            }
        }
    } else if (hotkeyName = "F2") {
        try {
            if (state) {
                Hotkey("F2", InsertTimestamp)
            } else {
                Hotkey("F2", "Off")
            }
        }
    } else if (hotkeyName = "F11") {
        try {
            if (state) {
                Hotkey("F11", ToggleTimer)
            } else {
                Hotkey("F11", "Off")
            }
        }
    } else if (hotkeyName = "ScriptMode") {
        try {
            if (state) {
                Hotkey("^Numpad7", ToggleScriptMode)
                Hotkey("^NumpadHome", ToggleScriptMode)
            } else {
                Hotkey("^Numpad7", "Off")
                Hotkey("^NumpadHome", "Off")
            }
        }
    } else if (hotkeyName = "ScriptSend") {
        try {
            if (state) {
                Hotkey("^Numpad5", SendScriptLine)
                Hotkey("^NumpadClear", SendScriptLine)
            } else {
                Hotkey("^Numpad5", "Off")
                Hotkey("^NumpadClear", "Off")
            }
        }
    } else if (hotkeyName = "ScriptNav") {
        try {
            if (state) {
                Hotkey("^Numpad8", PrevScriptLine)
                Hotkey("^NumpadUp", PrevScriptLine)
                Hotkey("^Numpad2", NextScriptLine)
                Hotkey("^NumpadDown", NextScriptLine)
            } else {
                Hotkey("^Numpad8", "Off")
                Hotkey("^NumpadUp", "Off")
                Hotkey("^Numpad2", "Off")
                Hotkey("^NumpadDown", "Off")
            }
        }
    } else if (hotkeyName = "ScriptNewline") {
        try {
            if (state) {
                Hotkey("^Numpad9", ToggleScriptAutoNewline)
                Hotkey("^NumpadPgUp", ToggleScriptAutoNewline)
            } else {
                Hotkey("^Numpad9", "Off")
                Hotkey("^NumpadPgUp", "Off")
            }
        }
    } else if (hotkeyName = "EnterTimestamp") {
        try {
            if (state) {
                Hotkey("~Enter", AutoTimestampOnEnter)
            } else {
                Hotkey("~Enter", "Off")
            }
        }
    }
}

; ############################################
; #      타이머 버그 수정 함수               #
; ############################################
OnBaseTimeChange() {
    newBaseTime := edtBaseTime.Text
    
    if (!RegExMatch(newBaseTime, "^(\d{1,2}):(\d{2}):(\d{2})$", &match)) {
        return
    }
    
    hours := Number(match[1])
    minutes := Number(match[2])
    seconds := Number(match[3])
    
    if (minutes >= 60 || seconds >= 60) {
        return
    }
    
    global timestampBaseTime := newBaseTime
    
    ; 수동 모드일 때만 기준시간 표시
    if (timestampMode = "manual" && !timestampRunning) {
        timeStr := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
        if (IsObject(lblElapsedTime) && lblElapsedTime.Hwnd) {
            lblElapsedTime.Text := timeStr
        }
        
        if (IsObject(timerPopupDisplay) && timerPopupDisplay.Hwnd) {
            timerPopupDisplay.Text := timeStr
        }
    }
}

UpdateElapsedTime() {
    if (timestampRunning) {
        elapsed := (A_TickCount - timestampStartTick) / 1000
        
        ; 수동 모드일 때만 기준시간 추가
        if (timestampMode = "manual") {
            baseParts := StrSplit(timestampBaseTime, ":")
            baseSeconds := baseParts[1] * 3600 + baseParts[2] * 60 + baseParts[3]
            totalSeconds := baseSeconds + elapsed
        } else {
            totalSeconds := elapsed
        }
        
        hours := Floor(totalSeconds / 3600)
        minutes := Floor(Mod(totalSeconds, 3600) / 60)
        seconds := Floor(Mod(totalSeconds, 60))
        
        timeStr := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
        if (IsObject(lblElapsedTime) && lblElapsedTime.Hwnd) {
            lblElapsedTime.Text := timeStr
        }
    } else if (timestampPausedOffset > 0) {
        elapsed := timestampPausedOffset / 1000
        
        if (timestampMode = "manual") {
            baseParts := StrSplit(timestampBaseTime, ":")
            baseSeconds := baseParts[1] * 3600 + baseParts[2] * 60 + baseParts[3]
            totalSeconds := baseSeconds + elapsed
        } else {
            totalSeconds := elapsed
        }
        
        hours := Floor(totalSeconds / 3600)
        minutes := Floor(Mod(totalSeconds, 3600) / 60)
        seconds := Floor(Mod(totalSeconds, 60))
        
        timeStr := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
        if (IsObject(lblElapsedTime) && lblElapsedTime.Hwnd) {
            lblElapsedTime.Text := timeStr
        }
    } else if (timestampMode = "manual") {
        ; 정지 상태에서 수동 모드일 때 기준시간 표시
        if (IsObject(lblElapsedTime) && lblElapsedTime.Hwnd) {
            lblElapsedTime.Text := timestampBaseTime
        }
    } else {
        if (IsObject(lblElapsedTime) && lblElapsedTime.Hwnd) {
            lblElapsedTime.Text := "00:00:00"
        }
    }
}

ResetTimer(*) {
    global timestampStartTick := 0
    global timestampPausedOffset := 0
    global timestampRunning := false
    
    ; 리셋 시 표시 업데이트
    if (timestampMode = "manual") {
        if (IsObject(lblElapsedTime) && lblElapsedTime.Hwnd) {
            lblElapsedTime.Text := timestampBaseTime
        }
        if (IsObject(timerPopupDisplay) && timerPopupDisplay.Hwnd) {
            timerPopupDisplay.Text := timestampBaseTime
        }
    } else {
        if (IsObject(lblElapsedTime) && lblElapsedTime.Hwnd) {
            lblElapsedTime.Text := "00:00:00"
        }
        if (IsObject(timerPopupDisplay) && timerPopupDisplay.Hwnd) {
            timerPopupDisplay.Text := "00:00:00"
        }
    }
    
    lblTimerStatus.Text := "상태: 정지"
    lblTimerStatus.SetFont("c" . Format("{:06X}", VSColors.text))
    btnTimerStart.Text := "▶ 시작"
    
    if (IsObject(timerPopupBtnStart) && timerPopupBtnStart.Hwnd) {
        timerPopupBtnStart.Text := "▶ 시작"
    }
}

UpdateTimerPopup() {
    if (!IsObject(timerPopupGui) || !timerPopupGui.Hwnd) {
        return
    }
    
    if (timestampRunning) {
        elapsed := (A_TickCount - timestampStartTick) / 1000
    } else if (timestampPausedOffset > 0) {
        elapsed := timestampPausedOffset / 1000
    } else {
        elapsed := 0
    }
    
    ; 수동 모드일 때만 기준시간 추가
    if (timestampMode = "manual") {
        baseParts := StrSplit(timestampBaseTime, ":")
        baseSeconds := baseParts[1] * 3600 + baseParts[2] * 60 + baseParts[3]
        totalSeconds := baseSeconds + elapsed
    } else if (elapsed > 0) {
        totalSeconds := elapsed
    } else if (timestampMode = "manual") {
        ; 정지 상태에서 수동 모드일 때
        baseParts := StrSplit(timestampBaseTime, ":")
        baseSeconds := baseParts[1] * 3600 + baseParts[2] * 60 + baseParts[3]
        totalSeconds := baseSeconds
    } else {
        totalSeconds := 0
    }
    
    hours := Floor(totalSeconds / 3600)
    minutes := Floor(Mod(totalSeconds, 3600) / 60)
    seconds := Floor(Mod(totalSeconds, 60))
    
    timeStr := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
    
    if (IsObject(timerPopupDisplay) && timerPopupDisplay.Hwnd) {
        timerPopupDisplay.Text := timeStr
    }
    
    if (IsObject(timerPopupStatus) && timerPopupStatus.Hwnd) {
        if (timestampRunning) {
            timerPopupStatus.Text := "상태: 실행 중"
            timerPopupStatus.SetFont("c" . Format("{:06X}", VSColors.success))
        } else if (timestampPausedOffset > 0) {
            timerPopupStatus.Text := "상태: 일시정지"
            timerPopupStatus.SetFont("c" . Format("{:06X}", VSColors.warning))
        } else {
            timerPopupStatus.Text := "상태: 정지"
            timerPopupStatus.SetFont("c" . Format("{:06X}", VSColors.text))
        }
    }
}
; ############################################
; #      별도창 수정 반영 버그 수정          #
; ############################################
EditScriptLineInPopup(*) {
    selected := scriptPopupListView.GetNext()
    if (!selected) {
        return
    }
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(selected, "Select Focus")
    }
    
    currentText := ""
    if (selected <= scriptLines.Length) {
        currentText := scriptLines[selected]
    }
    
    ib := InputBox("내용을 수정하세요:", "줄 편집 - " . selected, "w500 h120")
    ib.Value := currentText
    
    if (ib.Result = "OK") {
        if (selected <= scriptLines.Length) {
            cleanText := StrReplace(ib.Value, "`r", "")
            cleanText := StrReplace(cleanText, "`n", "")
            cleanText := LTrim(cleanText)
            scriptLines[selected] := cleanText
            
            global scriptSearchResults := []
            global currentSearchIndex := 0
            global scriptPopupSearchResults := []
            global currentPopupSearchIndex := 0
            
            ; 메인 리스트뷰 업데이트
            UpdateScriptListView()
            ; 팝업 리스트뷰 업데이트
            UpdateScriptPopupListView()
        }
    }
}

EditSpeakerInPopup(*) {
    selected := speakerPopupListView.GetNext()
    if (!selected) {
        return
    }
    
    currentName := speakers[selected].name
    ib := InputBox("새 이름을 입력하세요:", "화자 이름 수정", "w300 h120")
    ib.Value := currentName
    
    if (ib.Result = "OK" && ib.Value != "") {
        speakers[selected].name := ib.Value
        
        ; 메인 리스트뷰 업데이트
        UpdateSpeakerList()
        ; 팝업 리스트뷰 업데이트
        UpdateSpeakerPopupListView()
        
        if (IsObject(speakerListView) && speakerListView.Hwnd) {
            speakerListView.Modify(selected, "Select Focus")
        }
        
        SaveSettings()
    }
}

EditPhraseInPopup(*) {
    selected := phrasePopupListView.GetNext()
    if (!selected) {
        return
    }
    
    key := phrasePopupListView.GetText(selected, 1)
    
    if (!phrases.Has(key)) {
        MsgBox("선택한 상용구를 찾을 수 없습니다.", "오류", "Icon!")
        return
    }
    
    currentData := phrases[key]
    currentContent := currentData.content
    currentCount := currentData.HasProp("count") ? currentData.count : 0
    
    ib := InputBox("새 내용을 입력하세요:`n`n현재: " . currentContent, "상용구 수정 - " . key, "w400 h120")
    
    if (ib.Result = "OK" && ib.Value != "") {
        phrases[key] := {content: ib.Value, count: currentCount}
        
        ; 메인 리스트뷰 업데이트
        UpdatePhraseList()
        ; 팝업 리스트뷰 업데이트
        UpdatePhrasePopupListView()
        
        if (IsObject(phraseListView) && phraseListView.Hwnd) {
            Loop phraseListView.GetCount() {
                if (phraseListView.GetText(A_Index, 1) = key) {
                    phraseListView.Modify(A_Index, "Select Focus")
                    break
                }
            }
        }
        
        SaveSettings()
        
        if (chkShowTooltips.Value) {
            ShowModernTooltip("상용구 '" . key . "' 수정 완료", 1500)
        }
    }
}

EditSubtitleInPopup(*) {
    selected := subtitlePopupListView.GetNext()
    if (!selected) {
        return
    }
    
    if (selected > subtitleLines.Length) {
        return
    }
    
    sub := subtitleLines[selected]
    
    editGui := Gui("+Owner" . subtitlePopupGui.Hwnd, "자막 편집")
    editGui.BackColor := Format("{:06X}", VSColors.bg)
    
    editGui.AddText("x10 y10 w60 c" . Format("{:06X}", VSColors.text), "시작:")
    startEdit := editGui.AddEdit("x70 y8 w100 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), SubStr(TimeConverter.MsToSRT(sub.startMs), 1, 12))
    
    editGui.AddText("x180 y10 w60 c" . Format("{:06X}", VSColors.text), "종료:")
    endEdit := editGui.AddEdit("x240 y8 w100 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), SubStr(TimeConverter.MsToSRT(sub.endMs), 1, 12))
    
    editGui.AddText("x10 y40 w60 c" . Format("{:06X}", VSColors.text), "내용:")
    textEdit := editGui.AddEdit("x10 y60 w330 h80 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), sub.text)
    
    btnOK := editGui.AddButton("x180 y150 w80", "확인")
    btnOK.OnEvent("Click", ApplySubtitleEdit)
    
    ApplySubtitleEdit(*) {
        SaveUndoState()
        
        sub.startMs := TimeConverter.SRTtoMs(startEdit.Text)
        sub.endMs := TimeConverter.SRTtoMs(endEdit.Text)
        sub.text := textEdit.Text
        
        ; 메인 리스트뷰 업데이트
        UpdateSubtitleListView()
        ; 팝업 리스트뷰 업데이트
        UpdateSubtitlePopupListView()
        
        global subtitleModified := true
        editGui.Destroy()
    }
    
    btnCancel := editGui.AddButton("x270 y150 w70", "취소")
    btnCancel.OnEvent("Click", (*) => editGui.Destroy())
    
    editGui.Show("w350 h180")
}

; ############################################
; #      탭 문자 삽입 함수                  #
; ############################################
InsertTabToSuffix(*) {
    currentSuffix := edtSuffix.Text
    edtSuffix.Text := currentSuffix . "`t"
    UpdateSpeakerFormat()
    ShowModernTooltip("탭 문자가 추가되었습니다", 1000)
}

; ############################################
; #       타이머 팝업창 함수                 #
; ############################################
ShowTimerPopup(*) {
    if (IsObject(timerPopupGui) && timerPopupGui.Hwnd) {
        try {
            timerPopupGui.Show()
            return
        }
    }
    
    global timerPopupGui := Gui("+Resize +AlwaysOnTop", "타이머")
    timerPopupGui.BackColor := Format("{:06X}", VSColors.bg)
    
    global timerPopupDisplay := timerPopupGui.AddText("x10 y10 w380 h100 Center 0x200 Background" . Format("{:06X}", VSColors.bgSecondary) . " c" . Format("{:06X}", VSColors.accent) . " Border", "00:00:00")
    timerPopupDisplay.SetFont("s48 Bold", "Consolas")
    
    global timerPopupStatus := timerPopupGui.AddText("x10 y120 w380 h30 Center Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "상태: 정지")
    timerPopupStatus.SetFont("s12", "Segoe UI")
    
    global timerPopupBtnStart := CreateVSButton(timerPopupGui, 10, 160, 120, 40, "▶ 시작", true)
    timerPopupBtnStart.OnEvent("Click", StartTimer)
    
    global timerPopupBtnPause := CreateVSButton(timerPopupGui, 140, 160, 120, 40, "⏸ 일시정지")
    timerPopupBtnPause.OnEvent("Click", PauseTimer)
    
    global timerPopupBtnReset := CreateVSButton(timerPopupGui, 270, 160, 120, 40, "⏹ 리셋")
    timerPopupBtnReset.OnEvent("Click", ResetTimer)
    
    timerPopupGui.OnEvent("Size", OnTimerPopupResize)
    timerPopupGui.OnEvent("Close", CloseTimerPopup)
    
    popupWidth := Integer(IniRead(settingsFile, "TimerPopup", "Width", 400))
    popupHeight := Integer(IniRead(settingsFile, "TimerPopup", "Height", 220))
    popupX := IniRead(settingsFile, "TimerPopup", "X", "")
    popupY := IniRead(settingsFile, "TimerPopup", "Y", "")
    
    if (popupX != "" && popupY != "") {
        timerPopupGui.Show("w" . popupWidth . " h" . popupHeight . " x" . popupX . " y" . popupY)
    } else {
        timerPopupGui.Show("w" . popupWidth . " h" . popupHeight)
    }
    
    SetTimer(UpdateTimerPopup, 100)
}

OnTimerPopupResize(gui, MinMax, Width, Height) {
    if (MinMax = -1) {
        return
    }
    
    displayHeight := Height - 120
    if (displayHeight < 60) {
        displayHeight := 60
    }
    
    timerPopupDisplay.Move(10, 10, Width - 20, displayHeight)
    
    fontSize := Integer(displayHeight / 2.5)
    if (fontSize < 20) {
        fontSize := 20
    }
    if (fontSize > 72) {
        fontSize := 72
    }
    timerPopupDisplay.SetFont("s" . fontSize . " Bold", "Consolas")
    
    statusY := displayHeight + 20
    buttonY := statusY + 40
    buttonWidth := Integer((Width - 40) / 3)
    
    timerPopupStatus.Move(10, statusY, Width - 20, 30)
    timerPopupBtnStart.Move(10, buttonY, buttonWidth, 40)
    timerPopupBtnPause.Move(10 + buttonWidth + 10, buttonY, buttonWidth, 40)
    timerPopupBtnReset.Move(10 + (buttonWidth + 10) * 2, buttonY, buttonWidth, 40)
    
    if (MinMax = 0) {
        gui.GetPos(&guiX, &guiY)
        IniWrite(Width, settingsFile, "TimerPopup", "Width")
        IniWrite(Height, settingsFile, "TimerPopup", "Height")
        IniWrite(guiX, settingsFile, "TimerPopup", "X")
        IniWrite(guiY, settingsFile, "TimerPopup", "Y")
    }
}

CloseTimerPopup(*) {
    SetTimer(UpdateTimerPopup, 0)
    global timerPopupGui := ""
    global timerPopupDisplay := ""
    global timerPopupStatus := ""
    global timerPopupBtnStart := ""
    global timerPopupBtnPause := ""
    global timerPopupBtnReset := ""
}

; ############################################
; #       자막 팝업창 함수                   #
; ############################################
ShowSubtitlePopup(*) {
    if (IsObject(subtitlePopupGui) && subtitlePopupGui.Hwnd) {
        try {
            subtitlePopupGui.Show()
            return
        }
    }
    
    global subtitlePopupGui := Gui("+Resize", "자막 목록")
    subtitlePopupGui.BackColor := Format("{:06X}", VSColors.bg)
    
    subtitlePopupGui.AddText("x10 y10 w35 c" . Format("{:06X}", VSColors.text), "검색:")
    global subtitlePopupSearchInput := subtitlePopupGui.AddEdit("x50 y8 w200 h24 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    subtitlePopupSearchInput.SetFont("s9", "Segoe UI")
    subtitlePopupSearchInput.OnEvent("Change", (*) => PopupSubtitleSearch())
    
    btnPopupFind := CreateVSButton(subtitlePopupGui, 260, 7, 60, 26, "찾기")
    btnPopupFind.OnEvent("Click", PopupSubtitleSearch)
    
    global subtitlePopupListView := subtitlePopupGui.AddListView("x10 y40 w780 h450 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["번호", "시작", "종료", "지속", "CPS", "내용"])
    subtitlePopupListView.SetFont("s10", "Segoe UI")
    subtitlePopupListView.ModifyCol(1, 50)
    subtitlePopupListView.ModifyCol(2, 80)
    subtitlePopupListView.ModifyCol(3, 80)
    subtitlePopupListView.ModifyCol(4, 60)
    subtitlePopupListView.ModifyCol(5, 50)
    subtitlePopupListView.ModifyCol(6, 440)
    subtitlePopupListView.OnEvent("DoubleClick", EditSubtitleInPopup)
    
    global subtitlePopupStatus := subtitlePopupGui.AddText("x10 y500 w780 h25 c" . Format("{:06X}", VSColors.text), "")
    subtitlePopupStatus.SetFont("s9", "Segoe UI")
    
    subtitlePopupGui.OnEvent("Size", OnSubtitlePopupResize)
    subtitlePopupGui.OnEvent("Close", CloseSubtitlePopup)
    
    popupWidth := Integer(IniRead(settingsFile, "SubtitlePopup", "Width", 800))
    popupHeight := Integer(IniRead(settingsFile, "SubtitlePopup", "Height", 540))
    popupX := IniRead(settingsFile, "SubtitlePopup", "X", "")
    popupY := IniRead(settingsFile, "SubtitlePopup", "Y", "")
    
    UpdateSubtitlePopupListView()
    
    if (popupX != "" && popupY != "") {
        subtitlePopupGui.Show("w" . popupWidth . " h" . popupHeight . " x" . popupX . " y" . popupY)
    } else {
        subtitlePopupGui.Show("w" . popupWidth . " h" . popupHeight)
    }
}

OnSubtitlePopupResize(gui, MinMax, Width, Height) {
    if (MinMax = -1) {
        return
    }
    
    newListWidth := Width - 20
    newListHeight := Height - 90
    
    subtitlePopupListView.Move(10, 40, newListWidth, newListHeight)
    
    col1Width := 50
    col2Width := 80
    col3Width := 80
    col4Width := 60
    col5Width := 50
    col6Width := newListWidth - col1Width - col2Width - col3Width - col4Width - col5Width - 20
    
    subtitlePopupListView.ModifyCol(1, col1Width)
    subtitlePopupListView.ModifyCol(2, col2Width)
    subtitlePopupListView.ModifyCol(3, col3Width)
    subtitlePopupListView.ModifyCol(4, col4Width)
    subtitlePopupListView.ModifyCol(5, col5Width)
    subtitlePopupListView.ModifyCol(6, col6Width)
    
    statusY := Height - 40
    subtitlePopupStatus.Move(10, statusY, Width - 20)
    
    if (MinMax = 0) {
        gui.GetPos(&guiX, &guiY)
        IniWrite(Width, settingsFile, "SubtitlePopup", "Width")
        IniWrite(Height, settingsFile, "SubtitlePopup", "Height")
        IniWrite(guiX, settingsFile, "SubtitlePopup", "X")
        IniWrite(guiY, settingsFile, "SubtitlePopup", "Y")
    }
}

UpdateSubtitlePopupListView() {
    if (!IsObject(subtitlePopupListView) || !subtitlePopupListView.Hwnd) {
        return
    }
    
    subtitlePopupListView.Delete()
    
    for sub in subtitleLines {
        startTime := TimeConverter.MsToSRT(sub.startMs)
        endTime := TimeConverter.MsToSRT(sub.endMs)
        
        startTime := SubStr(startTime, 1, 8)
        endTime := SubStr(endTime, 1, 8)
        
        duration := Format("{:.1f}s", sub.GetDuration())
        cps := sub.GetCPS()
        cpsText := Format("{:.1f}", cps)
        
        text := StrReplace(sub.text, "`n", " ")
        
        subtitlePopupListView.Add("", sub.index, startTime, endTime, duration, cpsText, text)
        
        if (cps > 25) {
            subtitlePopupListView.Modify(sub.index, "+Check")
        }
    }
    
    if (IsObject(subtitlePopupStatus) && subtitlePopupStatus.Hwnd) {
        subtitlePopupStatus.Text := "총 " . subtitleLines.Length . "개 자막"
    }
}

PopupSubtitleSearch(*) {
    searchText := subtitlePopupSearchInput.Text
    if (searchText = "") {
        UpdateSubtitlePopupListView()
        return
    }
    
    found := false
    Loop subtitleLines.Length {
        if (InStr(subtitleLines[A_Index].text, searchText)) {
            subtitlePopupListView.Modify(0, "-Select")
            subtitlePopupListView.Modify(A_Index, "Select Focus Vis")
            found := true
            break
        }
    }
    
    if (!found) {
        ShowModernTooltip("찾을 수 없습니다.", 1000)
    }
}

CloseSubtitlePopup(*) {
    global subtitlePopupGui := ""
    global subtitlePopupListView := ""
    global subtitlePopupStatus := ""
    global subtitlePopupSearchInput := ""
}

; ############################################
; #       타임스탬프 자동 줄바꿈 함수        #
; ############################################
UpdateTimestampNewline() {
    global timestampAutoNewline := chkTimestampNewline.Value
    SaveSettings()
    
    if (timestampAutoNewline) {
        ShowModernTooltip("타임스탬프 후 자동 줄바꿈 ON", 1000)
    } else {
        ShowModernTooltip("타임스탬프 후 자동 줄바꿈 OFF", 1000)
    }
}

UpdateEnterTimestamp() {
    global enterAutoTimestamp := chkEnterTimestamp.Value
    SaveSettings()
    
    if (enterAutoTimestamp) {
        ShowModernTooltip("Enter 시 자동 타임스탬프 ON", 1000)
    } else {
        ShowModernTooltip("Enter 시 자동 타임스탬프 OFF", 1000)
    }
}

; ############################################
; #       자막 도구 클래스 및 함수           #
; ############################################
class SubtitleLine {
    index := 0
    startMs := 0
    endMs := 0
    text := ""
    speaker := ""
    
    GetCPS() {
        duration := (this.endMs - this.startMs) / 1000
        if (duration <= 0) {
            return 0
        }
        return Round(StrLen(this.text) / duration, 1)
    }
    
    GetDuration() {
        return (this.endMs - this.startMs) / 1000
    }
}

class TimeConverter {
    static SRTtoMs(timeStr) {
        if (RegExMatch(timeStr, "(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})", &m)) {
            return m[1] * 3600000 + m[2] * 60000 + m[3] * 1000 + m[4]
        }
        return 0
    }
    
    static MsToSRT(ms) {
        h := Floor(ms / 3600000)
        m := Floor(Mod(ms, 3600000) / 60000)
        s := Floor(Mod(ms, 60000) / 1000)
        ms := Mod(ms, 1000)
        return Format("{:02d}:{:02d}:{:02d},{:03d}", h, m, s, ms)
    }
    
    static MsToVTT(ms) {
        result := this.MsToSRT(ms)
        return StrReplace(result, ",", ".")
    }
    
    static MsToSBV(ms) {
        h := Floor(ms / 3600000)
        m := Floor(Mod(ms, 3600000) / 60000)
        s := Floor(Mod(ms, 60000) / 1000)
        ms := Mod(ms, 1000)
        return Format("{:d}:{:02d}:{:02d}.{:03d}", h, m, s, ms)
    }
}

; ############################################
; #       VS Code 스타일 버튼 생성 함수      #
; ############################################
CreateVSButton(gui, x, y, w, h, text, isPrimary := false, isDanger := false) {
    if (isDanger) {
        bgColor := Format("{:06X}", VSColors.error)
    } else if (isPrimary) {
        bgColor := Format("{:06X}", VSColors.buttonBg)
    } else {
        bgColor := Format("{:06X}", VSColors.bgTertiary)
    }
    
    btn := gui.AddText("x" . x . " y" . y . " w" . w . " h" . h . " Center 0x200 Background" . bgColor . " c" . Format("{:06X}", VSColors.text) . " Border", text)
    btn.SetFont("s9", "Segoe UI")
    
    return btn
}

; ############################################
; #       타임스탬프 관련 함수들             #
; ############################################
SetTimestampMode(mode) {
    global timestampMode := mode
    
    if (mode = "realtime") {
        edtBaseTime.Enabled := false
        SetCurrentTime()
    } else if (mode = "elapsed") {
        edtBaseTime.Enabled := false
        SetBaseTime("00:00:00")
        ResetTimer()
    } else if (mode = "manual") {
        edtBaseTime.Enabled := true
        OnBaseTimeChange()
    }
}

SetCurrentTime(*) {
    currentTime := FormatTime(A_Now, "HH:mm:ss")
    global timestampBaseTime := currentTime
    edtBaseTime.Text := currentTime
}

SetBaseTime(time) {
    global timestampBaseTime := time
    edtBaseTime.Text := time
    
    if (timestampMode = "manual") {
        OnBaseTimeChange()
    }
}

UpdateTimestampFormat(*) {
    formatText := ddlTimestampFormat.Text
    
    if (InStr(formatText, "[HH:mm:ss]")) {
        global timestampFormat := "[HH:mm:ss]"
    } else if (InStr(formatText, "(HH:mm:ss)")) {
        global timestampFormat := "(HH:mm:ss)"
    } else if (InStr(formatText, "HH:mm:ss -")) {
        global timestampFormat := "HH:mm:ss -"
    } else if (InStr(formatText, "HH시mm분ss초")) {
        global timestampFormat := "HH시mm분ss초"
    } else if (InStr(formatText, "[mm:ss]")) {
        global timestampFormat := "[mm:ss]"
    } else if (InStr(formatText, "(mm:ss)")) {
        global timestampFormat := "(mm:ss)"
    }
}

StartTimer(*) {
    if (!timestampRunning) {
        if (timestampPausedOffset > 0) {
            global timestampStartTick := A_TickCount - timestampPausedOffset
        } else {
            global timestampStartTick := A_TickCount
        }
        global timestampRunning := true
        lblTimerStatus.Text := "상태: 실행 중"
        lblTimerStatus.SetFont("c" . Format("{:06X}", VSColors.success))
        btnTimerStart.Text := "▶ 재개"
        
        if (IsObject(timerPopupBtnStart) && timerPopupBtnStart.Hwnd) {
            timerPopupBtnStart.Text := "▶ 재개"
        }
    }
}

PauseTimer(*) {
    if (timestampRunning) {
        global timestampPausedOffset := A_TickCount - timestampStartTick
        global timestampRunning := false
        lblTimerStatus.Text := "상태: 일시정지"
        lblTimerStatus.SetFont("c" . Format("{:06X}", VSColors.warning))
    }
}

ToggleTimer(*) {
    if (timestampRunning) {
        PauseTimer()
    } else {
        StartTimer()
    }
}

ClearTimestampRecords(*) {
    result := MsgBox("타임스탬프 기록을 모두 지우시겠습니까?", "확인", "YesNo Icon?")
    if (result = "No") {
        return
    }
    
    timestampListView.Delete()
}

ApplyTimeOffset(*) {
    offsetStr := edtSyncOffset.Text
    if (!IsNumber(offsetStr) && !InStr(offsetStr, "-")) {
        MsgBox("올바른 숫자를 입력하세요.", "오류", "Icon!")
        return
    }
    
    offset := Number(offsetStr)
    
    Loop scriptLines.Length {
        line := scriptLines[A_Index]
        
        if (RegExMatch(line, "\[(\d{2}):(\d{2}):(\d{2})\]", &match)) {
            hours := Number(match[1])
            minutes := Number(match[2])
            seconds := Number(match[3])
            
            totalSeconds := hours * 3600 + minutes * 60 + seconds + offset
            
            if (totalSeconds < 0) {
                totalSeconds := 0
            }
            
            newHours := Floor(totalSeconds / 3600)
            newMinutes := Floor(Mod(totalSeconds, 3600) / 60)
            newSeconds := Floor(Mod(totalSeconds, 60))
            
            newTime := Format("{:02d}:{:02d}:{:02d}", newHours, newMinutes, newSeconds)
            scriptLines[A_Index] := RegExReplace(line, "\[\d{2}:\d{2}:\d{2}\]", "[" . newTime . "]")
        }
    }
    
    UpdateScriptListView()
    ShowModernTooltip(offset . "초 오프셋 적용 완료", 1500)
}

ExportToSRT(*) {
    if (scriptLines.Length = 0) {
        MsgBox("대본 송출 탭에 내용이 없습니다.", "알림", "Icon!")
        return
    }
    
    selectedFile := FileSelect("S", "자막_" . FormatTime(A_Now, "yyyyMMdd_HHmmss") . ".srt", "SRT 파일 저장", "SRT 파일 (*.srt)")
    if (!selectedFile) {
        return
    }
    
    srtContent := ""
    index := 1
    
    Loop scriptLines.Length {
        line := scriptLines[A_Index]
        
        if (RegExMatch(line, "\[(\d{2}:\d{2}:\d{2})\]\s*(.*)", &match)) {
            startTime := match[1]
            text := match[2]
            
            endTime := startTime
            if (A_Index < scriptLines.Length) {
                nextLine := scriptLines[A_Index + 1]
                if (RegExMatch(nextLine, "\[(\d{2}:\d{2}:\d{2})\]", &nextMatch)) {
                    endTime := nextMatch[1]
                } else {
                    parts := StrSplit(startTime, ":")
                    totalSeconds := parts[1] * 3600 + parts[2] * 60 + parts[3] + 3
                    hours := Floor(totalSeconds / 3600)
                    minutes := Floor(Mod(totalSeconds, 3600) / 60)
                    seconds := Floor(Mod(totalSeconds, 60))
                    endTime := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
                }
            } else {
                parts := StrSplit(startTime, ":")
                totalSeconds := parts[1] * 3600 + parts[2] * 60 + parts[3] + 3
                hours := Floor(totalSeconds / 3600)
                minutes := Floor(Mod(totalSeconds, 3600) / 60)
                seconds := Floor(Mod(totalSeconds, 60))
                endTime := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
            }
            
            srtContent .= index . "`r`n"
            srtContent .= startTime . ",000 --> " . endTime . ",000`r`n"
            srtContent .= text . "`r`n`r`n"
            index++
        }
    }
    
    if (srtContent = "") {
        MsgBox("타임스탬프가 포함된 줄이 없습니다.", "알림", "Icon!")
        return
    }
    
    try {
        FileAppend(srtContent, selectedFile, "UTF-8")
        MsgBox("SRT 파일이 저장되었습니다.`n`n" . selectedFile, "성공", "Icon!")
    } catch as err {
        MsgBox("파일 저장 중 오류가 발생했습니다.", "오류", "Icon!")
    }
}

ExportToVTT(*) {
    if (scriptLines.Length = 0) {
        MsgBox("대본 송출 탭에 내용이 없습니다.", "알림", "Icon!")
        return
    }
    
    selectedFile := FileSelect("S", "자막_" . FormatTime(A_Now, "yyyyMMdd_HHmmss") . ".vtt", "VTT 파일 저장", "VTT 파일 (*.vtt)")
    if (!selectedFile) {
        return
    }
    
    vttContent := "WEBVTT`r`n`r`n"
    
    Loop scriptLines.Length {
        line := scriptLines[A_Index]
        
        if (RegExMatch(line, "\[(\d{2}:\d{2}:\d{2})\]\s*(.*)", &match)) {
            startTime := match[1]
            text := match[2]
            
            endTime := startTime
            if (A_Index < scriptLines.Length) {
                nextLine := scriptLines[A_Index + 1]
                if (RegExMatch(nextLine, "\[(\d{2}:\d{2}:\d{2})\]", &nextMatch)) {
                    endTime := nextMatch[1]
                } else {
                    parts := StrSplit(startTime, ":")
                    totalSeconds := parts[1] * 3600 + parts[2] * 60 + parts[3] + 3
                    hours := Floor(totalSeconds / 3600)
                    minutes := Floor(Mod(totalSeconds, 3600) / 60)
                    seconds := Floor(Mod(totalSeconds, 60))
                    endTime := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
                }
            } else {
                parts := StrSplit(startTime, ":")
                totalSeconds := parts[1] * 3600 + parts[2] * 60 + parts[3] + 3
                hours := Floor(totalSeconds / 3600)
                minutes := Floor(Mod(totalSeconds, 3600) / 60)
                seconds := Floor(Mod(totalSeconds, 60))
                endTime := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
            }
            
            vttContent .= startTime . ".000 --> " . endTime . ".000`r`n"
            vttContent .= text . "`r`n`r`n"
        }
    }
    
    if (vttContent = "WEBVTT`r`n`r`n") {
        MsgBox("타임스탬프가 포함된 줄이 없습니다.", "알림", "Icon!")
        return
    }
    
    try {
        FileAppend(vttContent, selectedFile, "UTF-8")
        MsgBox("VTT 파일이 저장되었습니다.`n`n" . selectedFile, "성공", "Icon!")
    } catch as err {
        MsgBox("파일 저장 중 오류가 발생했습니다.", "오류", "Icon!")
    }
}

AutoTimestampOnEnter(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (!enterAutoTimestamp) {
        return
    }
    
    Sleep(50)
    
    if (timestampMode = "realtime") {
        currentTime := FormatTime(A_Now, "HH:mm:ss")
    } else {
        if (timestampRunning) {
            elapsed := (A_TickCount - timestampStartTick) / 1000
        } else if (timestampPausedOffset > 0) {
            elapsed := timestampPausedOffset / 1000
        } else {
            elapsed := 0
        }
        
        baseParts := StrSplit(timestampBaseTime, ":")
        baseSeconds := baseParts[1] * 3600 + baseParts[2] * 60 + baseParts[3]
        totalSeconds := baseSeconds + elapsed
        
        hours := Floor(totalSeconds / 3600)
        minutes := Floor(Mod(totalSeconds, 3600) / 60)
        seconds := Floor(Mod(totalSeconds, 60))
        
        currentTime := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
    }
    
    if (timestampFormat = "[HH:mm:ss]") {
        output := "[" . currentTime . "] "
    } else if (timestampFormat = "(HH:mm:ss)") {
        output := "(" . currentTime . ") "
    } else if (timestampFormat = "HH:mm:ss -") {
        output := currentTime . " - "
    } else if (timestampFormat = "HH시mm분ss초") {
        parts := StrSplit(currentTime, ":")
        output := parts[1] . "시" . parts[2] . "분" . parts[3] . "초 "
    } else if (timestampFormat = "[mm:ss]") {
        parts := StrSplit(currentTime, ":")
        output := "[" . parts[2] . ":" . parts[3] . "] "
    } else if (timestampFormat = "(mm:ss)") {
        parts := StrSplit(currentTime, ":")
        output := "(" . parts[2] . ":" . parts[3] . ") "
    } else {
        output := "[" . currentTime . "] "
    }
    
    SendText(output)
    
    if (IsObject(timestampListView) && timestampListView.Hwnd) {
        rowNum := timestampListView.GetCount() + 1
        timestampListView.Add("", rowNum, output, "자동")
    }
}

InsertTimestamp(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (timestampMode = "realtime") {
        currentTime := FormatTime(A_Now, "HH:mm:ss")
    } else {
        if (timestampRunning) {
            elapsed := (A_TickCount - timestampStartTick) / 1000
        } else if (timestampPausedOffset > 0) {
            elapsed := timestampPausedOffset / 1000
        } else {
            elapsed := 0
        }
        
        baseParts := StrSplit(timestampBaseTime, ":")
        baseSeconds := baseParts[1] * 3600 + baseParts[2] * 60 + baseParts[3]
        totalSeconds := baseSeconds + elapsed
        
        hours := Floor(totalSeconds / 3600)
        minutes := Floor(Mod(totalSeconds, 3600) / 60)
        seconds := Floor(Mod(totalSeconds, 60))
        
        currentTime := Format("{:02d}:{:02d}:{:02d}", hours, minutes, seconds)
    }
    
    if (timestampFormat = "[HH:mm:ss]") {
        output := "[" . currentTime . "] "
    } else if (timestampFormat = "(HH:mm:ss)") {
        output := "(" . currentTime . ") "
    } else if (timestampFormat = "HH:mm:ss -") {
        output := currentTime . " - "
    } else if (timestampFormat = "HH시mm분ss초") {
        parts := StrSplit(currentTime, ":")
        output := parts[1] . "시" . parts[2] . "분" . parts[3] . "초 "
    } else if (timestampFormat = "[mm:ss]") {
        parts := StrSplit(currentTime, ":")
        output := "[" . parts[2] . ":" . parts[3] . "] "
    } else if (timestampFormat = "(mm:ss)") {
        parts := StrSplit(currentTime, ":")
        output := "(" . parts[2] . ":" . parts[3] . ") "
    } else {
        output := "[" . currentTime . "] "
    }
    
    SendText(output)
    
    if (timestampAutoNewline) {
        Send("{Enter}")
    }
    
    if (IsObject(timestampListView) && timestampListView.Hwnd) {
        rowNum := timestampListView.GetCount() + 1
        timestampListView.Add("", rowNum, output, "")
    }
    
    ShowModernTooltip("타임스탬프: " . output, 800)
}

; ############################################
; #       자막 파일 처리 함수들              #
; ############################################
OpenSubtitleFile(*) {
    selectedFile := FileSelect(1, , "자막 파일 선택", "자막 파일 (*.srt;*.vtt;*.ass;*.sbv;*.txt)")
    if (!selectedFile) {
        return
    }
    
    try {
        fileContent := FileRead(selectedFile, "UTF-8")
        
        SplitPath(selectedFile, &fileName, , &ext)
        ext := StrLower(ext)
        
        global subtitleLines := []
        
        if (ext = "srt") {
            ParseSRTContent(fileContent)
        } else if (ext = "vtt") {
            ParseVTTContent(fileContent)
        } else if (ext = "sbv") {
            ParseSBVContent(fileContent)
        } else if (ext = "txt") {
            ParseTXTContent(fileContent)
        } else if (ext = "ass" || ext = "ssa") {
            ParseASSContent(fileContent)
        } else {
            MsgBox("지원하지 않는 파일 형식입니다.", "오류", "Icon!")
            return
        }
        
        UpdateSubtitleListView()
        UpdateSubtitlePopupListView()
        
        global currentSubtitleFile := selectedFile
        global subtitleModified := false
        lblSubtitleStatus.Text := "파일: " . fileName . " (" . subtitleLines.Length . "개 자막)"
        
        ShowModernTooltip(subtitleLines.Length . "개의 자막을 불러왔습니다.", 1500)
        
    } catch as err {
        MsgBox("파일을 읽는 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
    }
}

ParseSRTContent(content) {
    global subtitleLines := []
    
    content := StrReplace(content, "`r`n", "`n")
    blocks := StrSplit(content, "`n`n")
    
    for block in blocks {
        lines := StrSplit(Trim(block), "`n")
        if (lines.Length < 3) {
            continue
        }
        
        timeLineIndex := 0
        Loop lines.Length {
            if (InStr(lines[A_Index], "-->")) {
                timeLineIndex := A_Index
                break
            }
        }
        
        if (timeLineIndex = 0) {
            continue
        }
        
        timeLine := lines[timeLineIndex]
        if (RegExMatch(timeLine, "(.+)\s*-->\s*(.+)", &m)) {
            sub := SubtitleLine()
            sub.index := subtitleLines.Length + 1
            sub.startMs := TimeConverter.SRTtoMs(Trim(m[1]))
            sub.endMs := TimeConverter.SRTtoMs(Trim(m[2]))
            
            text := ""
            Loop lines.Length {
                if (A_Index > timeLineIndex) {
                    if (text != "") {
                        text .= "`n"
                    }
                    text .= lines[A_Index]
                }
            }
            sub.text := Trim(text)
            
            if (sub.text != "") {
                subtitleLines.Push(sub)
            }
        }
    }
}

ParseVTTContent(content) {
    global subtitleLines := []
    
    content := RegExReplace(content, "^WEBVTT.*?\n\n", "")
    content := StrReplace(content, "`r`n", "`n")
    blocks := StrSplit(content, "`n`n")
    
    for block in blocks {
        lines := StrSplit(Trim(block), "`n")
        
        for line in lines {
            if (InStr(line, "-->")) {
                if (RegExMatch(line, "(.+)\s*-->\s*(.+)", &m)) {
                    sub := SubtitleLine()
                    sub.index := subtitleLines.Length + 1
                    
                    startTime := StrReplace(Trim(m[1]), ".", ",")
                    endTime := StrReplace(Trim(m[2]), ".", ",")
                    
                    sub.startMs := TimeConverter.SRTtoMs(startTime)
                    sub.endMs := TimeConverter.SRTtoMs(endTime)
                    
                    text := ""
                    textStarted := false
                    for i, l in lines {
                        if (textStarted) {
                            if (text != "") {
                                text .= "`n"
                            }
                            text .= l
                        } else if (l = line) {
                            textStarted := true
                        }
                    }
                    sub.text := Trim(text)
                    
                    if (sub.text != "") {
                        subtitleLines.Push(sub)
                    }
                    break
                }
            }
        }
    }
}

ParseTXTContent(content) {
    global subtitleLines := []
    
    lines := StrSplit(content, "`n")
    for line in lines {
        line := Trim(line)
        
        if (RegExMatch(line, "\[(\d{2}:\d{2}:\d{2})\]\s*(.*)", &m)) {
            sub := SubtitleLine()
            sub.index := subtitleLines.Length + 1
            sub.startMs := TimeConverter.SRTtoMs(m[1] . ",000")
            
            if (subtitleLines.Length > 0) {
                prevSub := subtitleLines[subtitleLines.Length]
                prevSub.endMs := sub.startMs - 100
            }
            
            sub.endMs := sub.startMs + 3000
            sub.text := m[2]
            
            if (sub.text != "") {
                subtitleLines.Push(sub)
            }
        }
    }
}

ParseSBVContent(content) {
    global subtitleLines := []
    
    content := StrReplace(content, "`r`n", "`n")
    blocks := StrSplit(content, "`n`n")
    
    for block in blocks {
        lines := StrSplit(Trim(block), "`n")
        if (lines.Length < 2) {
            continue
        }
        
        timeLine := lines[1]
        if (RegExMatch(timeLine, "(.+),(.+)", &m)) {
            sub := SubtitleLine()
            sub.index := subtitleLines.Length + 1
            
            startTime := StrReplace(Trim(m[1]), ".", ",")
            endTime := StrReplace(Trim(m[2]), ".", ",")
            
            if (!InStr(startTime, ":")) {
                startTime := "0:" . startTime
            }
            if (!InStr(endTime, ":")) {
                endTime := "0:" . endTime
            }
            
            sub.startMs := TimeConverter.SRTtoMs(startTime)
            sub.endMs := TimeConverter.SRTtoMs(endTime)
            
            text := ""
            Loop lines.Length {
                if (A_Index > 1) {
                    if (text != "") {
                        text .= "`n"
                    }
                    text .= lines[A_Index]
                }
            }
            sub.text := Trim(text)
            
            if (sub.text != "") {
                subtitleLines.Push(sub)
            }
        }
    }
}

ParseASSContent(content) {
    global subtitleLines := []
    
    lines := StrSplit(content, "`n")
    for line in lines {
        if (InStr(line, "Dialogue:")) {
            if (RegExMatch(line, "Dialogue:[^,]*,([^,]+),([^,]+),[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,,(.*)", &m)) {
                sub := SubtitleLine()
                sub.index := subtitleLines.Length + 1
                
                startTime := m[1] . "0"
                endTime := m[2] . "0"
                
                startTime := StrReplace(startTime, ".", ",")
                endTime := StrReplace(endTime, ".", ",")
                
                sub.startMs := TimeConverter.SRTtoMs(startTime)
                sub.endMs := TimeConverter.SRTtoMs(endTime)
                sub.text := StrReplace(m[3], "\N", "`n")
                
                if (sub.text != "") {
                    subtitleLines.Push(sub)
                }
            }
        }
    }
}

UpdateSubtitleListView() {
    subtitleListView.Delete()
    
    for sub in subtitleLines {
        startTime := TimeConverter.MsToSRT(sub.startMs)
        endTime := TimeConverter.MsToSRT(sub.endMs)
        
        startTime := SubStr(startTime, 1, 8)
        endTime := SubStr(endTime, 1, 8)
        
        duration := Format("{:.1f}s", sub.GetDuration())
        cps := sub.GetCPS()
        cpsText := Format("{:.1f}", cps)
        
        text := StrReplace(sub.text, "`n", " ")
        
        subtitleListView.Add("", sub.index, startTime, endTime, duration, cpsText, text)
        
        if (cps > 25) {
            subtitleListView.Modify(sub.index, "+Check")
        }
    }
}

ApplySubtitleTimeShift(*) {
    if (subtitleLines.Length = 0) {
        MsgBox("자막이 없습니다.", "알림", "Icon!")
        return
    }
    
    offsetStr := edtTimeShift.Text
    
    if (!RegExMatch(offsetStr, "^-?\d*\.?\d+$")) {
        MsgBox("올바른 숫자를 입력하세요.", "오류", "Icon!")
        return
    }
    
    SaveUndoState()
    
    offset := Float(offsetStr) * 1000
    
    for sub in subtitleLines {
        sub.startMs += offset
        sub.endMs += offset
        
        if (sub.startMs < 0) {
            sub.startMs := 0
        }
        if (sub.endMs < 0) {
            sub.endMs := 0
        }
    }
    
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    global subtitleModified := true
    ShowModernTooltip(offsetStr . "초 시간 조정 완료", 1500)
}

SyncFirstSubtitle(*) {
    if (subtitleLines.Length = 0) {
        MsgBox("자막이 없습니다.", "알림", "Icon!")
        return
    }
    
    ib := InputBox("첫 자막이 시작할 시간을 입력하세요 (예: 00:00:05)", "첫 자막 동기화", "w300 h120")
    if (ib.Result != "OK" || ib.Value = "") {
        return
    }
    
    targetMs := TimeConverter.SRTtoMs(ib.Value . ",000")
    currentFirstMs := subtitleLines[1].startMs
    offset := targetMs - currentFirstMs
    
    SaveUndoState()
    
    for sub in subtitleLines {
        sub.startMs += offset
        sub.endMs += offset
    }
    
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    global subtitleModified := true
    ShowModernTooltip("첫 자막을 " . ib.Value . "로 동기화했습니다.", 1500)
}

MergeSubtitles(*) {
    selected := subtitleListView.GetNext()
    if (!selected || selected >= subtitleLines.Length) {
        MsgBox("병합할 첫 번째 자막을 선택하세요.", "알림", "Icon!")
        return
    }
    
    SaveUndoState()
    
    sub1 := subtitleLines[selected]
    sub2 := subtitleLines[selected + 1]
    
    sub1.endMs := sub2.endMs
    sub1.text .= " " . sub2.text
    
    subtitleLines.RemoveAt(selected + 1)
    
    Loop subtitleLines.Length {
        subtitleLines[A_Index].index := A_Index
    }
    
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    global subtitleModified := true
    ShowModernTooltip("자막 병합 완료", 1000)
}

SplitSubtitles(*) {
    selected := subtitleListView.GetNext()
    if (!selected) {
        MsgBox("분할할 자막을 선택하세요.", "알림", "Icon!")
        return
    }
    
    sub := subtitleLines[selected]
    
    if (StrLen(sub.text) < 40) {
        MsgBox("자막이 너무 짧아 분할할 수 없습니다.", "알림", "Icon!")
        return
    }
    
    SaveUndoState()
    
    midPoint := StrLen(sub.text) / 2
    splitPos := midPoint
    
    text := sub.text
    bestPos := midPoint
    minDiff := StrLen(text)
    
    Loop Parse, text {
        if (A_LoopField = " ") {
            diff := Abs(A_Index - midPoint)
            if (diff < minDiff) {
                minDiff := diff
                bestPos := A_Index
            }
        }
    }
    
    splitPos := bestPos
    
    text1 := SubStr(text, 1, splitPos - 1)
    text2 := SubStr(text, splitPos + 1)
    
    midTime := sub.startMs + (sub.endMs - sub.startMs) / 2
    
    sub.text := Trim(text1)
    oldEndMs := sub.endMs
    sub.endMs := midTime - 50
    
    newSub := SubtitleLine()
    newSub.startMs := midTime + 50
    newSub.endMs := oldEndMs
    newSub.text := Trim(text2)
    
    subtitleLines.InsertAt(selected + 1, newSub)
    
    Loop subtitleLines.Length {
        subtitleLines[A_Index].index := A_Index
    }
    
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    global subtitleModified := true
    ShowModernTooltip("자막 분할 완료", 1000)
}

CheckSubtitleCPS(*) {
    if (subtitleLines.Length = 0) {
        MsgBox("자막이 없습니다.", "알림", "Icon!")
        return
    }
    
    problemCount := 0
    problemList := ""
    
    for sub in subtitleLines {
        cps := sub.GetCPS()
        if (cps > 20) {
            problemCount++
            problemList .= Format("#{}: CPS {:.1f} - {}`n", sub.index, cps, SubStr(sub.text, 1, 30))
            
            if (problemCount >= 10) {
                problemList .= "..."
                break
            }
        }
    }
    
    if (problemCount = 0) {
        MsgBox("모든 자막의 CPS가 정상 범위입니다.", "CPS 검사 결과", "Icon!")
    } else {
        MsgBox("CPS가 높은 자막: " . problemCount . "개`n`n" . problemList, "CPS 검사 결과", "Icon!")
    }
}

FixOverlappingSubtitles(*) {
    if (subtitleLines.Length < 2) {
        MsgBox("자막이 2개 이상 필요합니다.", "알림", "Icon!")
        return
    }
    
    SaveUndoState()
    
    fixedCount := 0
    
    Loop subtitleLines.Length - 1 {
        sub1 := subtitleLines[A_Index]
        sub2 := subtitleLines[A_Index + 1]
        
        if (sub1.endMs > sub2.startMs) {
            gap := 100
            sub1.endMs := sub2.startMs - gap
            fixedCount++
        }
    }
    
    if (fixedCount > 0) {
        UpdateSubtitleListView()
        UpdateSubtitlePopupListView()
        global subtitleModified := true
        ShowModernTooltip(fixedCount . "개의 겹침을 수정했습니다.", 1500)
    } else {
        ShowModernTooltip("겹치는 자막이 없습니다.", 1000)
    }
}

AddSubtitleLine(*) {
    selected := subtitleListView.GetNext()
    insertPos := selected ? selected + 1 : subtitleLines.Length + 1
    
    SaveUndoState()
    
    newSub := SubtitleLine()
    
    if (insertPos > 1 && insertPos <= subtitleLines.Length) {
        prevSub := subtitleLines[insertPos - 1]
        newSub.startMs := prevSub.endMs + 1000
        newSub.endMs := newSub.startMs + 3000
    } else if (insertPos > subtitleLines.Length && subtitleLines.Length > 0) {
        lastSub := subtitleLines[subtitleLines.Length]
        newSub.startMs := lastSub.endMs + 1000
        newSub.endMs := newSub.startMs + 3000
    } else {
        newSub.startMs := 0
        newSub.endMs := 3000
    }
    
    newSub.text := "새 자막"
    
    if (insertPos > subtitleLines.Length) {
        subtitleLines.Push(newSub)
    } else {
        subtitleLines.InsertAt(insertPos, newSub)
    }
    
    Loop subtitleLines.Length {
        subtitleLines[A_Index].index := A_Index
    }
    
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    global subtitleModified := true
    
    subtitleListView.Modify(0, "-Select")
    subtitleListView.Modify(insertPos, "Select Focus")
    EditSubtitleLine()
}

DeleteSubtitleLine(*) {
    selected := subtitleListView.GetNext()
    if (!selected) {
        MsgBox("삭제할 자막을 선택하세요.", "알림", "Icon!")
        return
    }
    
    SaveUndoState()
    
    subtitleLines.RemoveAt(selected)
    
    Loop subtitleLines.Length {
        subtitleLines[A_Index].index := A_Index
    }
    
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    global subtitleModified := true
    ShowModernTooltip("자막 삭제됨", 800)
}

EditSubtitleLine(*) {
    selected := subtitleListView.GetNext()
    if (!selected) {
        return
    }
    
    sub := subtitleLines[selected]
    
    editGui := Gui("+Owner" . mainGui.Hwnd, "자막 편집")
    editGui.BackColor := Format("{:06X}", VSColors.bg)
    
    editGui.AddText("x10 y10 w60 c" . Format("{:06X}", VSColors.text), "시작:")
    startEdit := editGui.AddEdit("x70 y8 w100 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), SubStr(TimeConverter.MsToSRT(sub.startMs), 1, 12))
    
    editGui.AddText("x180 y10 w60 c" . Format("{:06X}", VSColors.text), "종료:")
    endEdit := editGui.AddEdit("x240 y8 w100 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), SubStr(TimeConverter.MsToSRT(sub.endMs), 1, 12))
    
    editGui.AddText("x10 y40 w60 c" . Format("{:06X}", VSColors.text), "내용:")
    textEdit := editGui.AddEdit("x10 y60 w330 h80 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), sub.text)
    
    btnOK := editGui.AddButton("x180 y150 w80", "확인")
    btnOK.OnEvent("Click", ApplySubtitleEdit)
    
    ApplySubtitleEdit(*) {
        SaveUndoState()
        
        sub.startMs := TimeConverter.SRTtoMs(startEdit.Text)
        sub.endMs := TimeConverter.SRTtoMs(endEdit.Text)
        sub.text := textEdit.Text
        
        UpdateSubtitleListView()
        UpdateSubtitlePopupListView()
        global subtitleModified := true
        editGui.Destroy()
    }
    
    btnCancel := editGui.AddButton("x270 y150 w70", "취소")
    btnCancel.OnEvent("Click", (*) => editGui.Destroy())
    
    editGui.Show("w350 h180")
}

ClearSubtitles(*) {
    if (subtitleLines.Length = 0) {
        return
    }
    
    result := MsgBox("모든 자막을 지우시겠습니까?", "확인", "YesNo Icon?")
    if (result = "No") {
        return
    }
    
    SaveUndoState()
    
    global subtitleLines := []
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    global subtitleModified := true
}

FindNextSubtitle(*) {
    searchText := subtitleSearchInput.Text
    if (searchText = "") {
        return
    }
    
    startPos := subtitleListView.GetNext() + 1
    if (startPos > subtitleLines.Length) {
        startPos := 1
    }
    
    found := false
    Loop subtitleLines.Length {
        idx := Mod(startPos + A_Index - 2, subtitleLines.Length) + 1
        if (InStr(subtitleLines[idx].text, searchText)) {
            subtitleListView.Modify(0, "-Select")
            subtitleListView.Modify(idx, "Select Focus Vis")
            found := true
            break
        }
    }
    
    if (!found) {
        ShowModernTooltip("찾을 수 없습니다.", 1000)
    }
}

ReplaceOneSubtitle(*) {
    selected := subtitleListView.GetNext()
    if (!selected) {
        FindNextSubtitle()
        return
    }
    
    searchText := subtitleSearchInput.Text
    replaceText := subtitleReplaceInput.Text
    
    if (searchText = "") {
        return
    }
    
    sub := subtitleLines[selected]
    if (InStr(sub.text, searchText)) {
        SaveUndoState()
        sub.text := StrReplace(sub.text, searchText, replaceText)
        UpdateSubtitleListView()
        UpdateSubtitlePopupListView()
        global subtitleModified := true
        FindNextSubtitle()
    }
}

ReplaceAllSubtitles(*) {
    searchText := subtitleSearchInput.Text
    replaceText := subtitleReplaceInput.Text
    
    if (searchText = "") {
        return
    }
    
    SaveUndoState()
    
    replaceCount := 0
    for sub in subtitleLines {
        if (InStr(sub.text, searchText)) {
            sub.text := StrReplace(sub.text, searchText, replaceText)
            replaceCount++
        }
    }
    
    if (replaceCount > 0) {
        UpdateSubtitleListView()
        UpdateSubtitlePopupListView()
        global subtitleModified := true
        ShowModernTooltip(replaceCount . "개 항목을 바꿨습니다.", 1500)
    } else {
        ShowModernTooltip("찾을 수 없습니다.", 1000)
    }
}

SaveUndoState() {
    state := []
    for sub in subtitleLines {
        newSub := SubtitleLine()
        newSub.index := sub.index
        newSub.startMs := sub.startMs
        newSub.endMs := sub.endMs
        newSub.text := sub.text
        state.Push(newSub)
    }
    
    global subtitleUndoStack
    subtitleUndoStack.Push(state)
    
    if (subtitleUndoStack.Length > 20) {
        subtitleUndoStack.RemoveAt(1)
    }
    
    global subtitleRedoStack := []
}

UndoSubtitleChange(*) {
    global subtitleUndoStack, subtitleRedoStack, subtitleLines
    
    if (subtitleUndoStack.Length = 0) {
        ShowModernTooltip("실행 취소할 작업이 없습니다.", 1000)
        return
    }
    
    currentState := []
    for sub in subtitleLines {
        newSub := SubtitleLine()
        newSub.index := sub.index
        newSub.startMs := sub.startMs
        newSub.endMs := sub.endMs
        newSub.text := sub.text
        currentState.Push(newSub)
    }
    subtitleRedoStack.Push(currentState)
    
    subtitleLines := subtitleUndoStack.Pop()
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    ShowModernTooltip("실행 취소", 800)
}

RedoSubtitleChange(*) {
    global subtitleUndoStack, subtitleRedoStack, subtitleLines
    
    if (subtitleRedoStack.Length = 0) {
        ShowModernTooltip("재실행할 작업이 없습니다.", 1000)
        return
    }
    
    currentState := []
    for sub in subtitleLines {
        newSub := SubtitleLine()
        newSub.index := sub.index
        newSub.startMs := sub.startMs
        newSub.endMs := sub.endMs
        newSub.text := sub.text
        currentState.Push(newSub)
    }
    subtitleUndoStack.Push(currentState)
    
    subtitleLines := subtitleRedoStack.Pop()
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    ShowModernTooltip("재실행", 800)
}

SaveSubtitleFile(*) {
    if (!currentSubtitleFile) {
        SaveAsSubtitleFile()
        return
    }
    
    SplitPath(currentSubtitleFile, , , &ext)
    content := GenerateSubtitleContent(StrLower(ext))
    
    try {
        FileDelete(currentSubtitleFile)
        FileAppend(content, currentSubtitleFile, "UTF-8")
        global subtitleModified := false
        ShowModernTooltip("저장 완료", 1000)
    } catch as err {
        MsgBox("저장 실패: " . err.Message, "오류", "Icon!")
    }
}

SaveAsSubtitleFile(*) {
    selectedFile := FileSelect("S", "subtitle.srt", "자막 저장", "SRT 파일 (*.srt)")
    if (!selectedFile) {
        return
    }
    
    global currentSubtitleFile := selectedFile
    SaveSubtitleFile()
}

ExportSubtitle(*) {
    if (subtitleLines.Length = 0) {
        MsgBox("내보낼 자막이 없습니다.", "알림", "Icon!")
        return
    }
    
    formatIndex := ddlExportFormat.Value
    formats := ["srt", "vtt", "ass", "sbv", "txt"]
    format := formats[formatIndex]
    
    selectedFile := FileSelect("S", "subtitle." . format, "자막 내보내기", 
        StrUpper(format) . " 파일 (*." . format . ")")
    
    if (!selectedFile) {
        return
    }
    
    content := GenerateSubtitleContent(format)
    
    try {
        FileAppend(content, selectedFile, "UTF-8")
        MsgBox("내보내기 완료!`n`n" . selectedFile, "성공", "Icon!")
    } catch as err {
        MsgBox("내보내기 실패: " . err.Message, "오류", "Icon!")
    }
}

GenerateSubtitleContent(format) {
    content := ""
    
    if (format = "srt") {
        Loop subtitleLines.Length {
            sub := subtitleLines[A_Index]
            content .= A_Index . "`r`n"
            content .= TimeConverter.MsToSRT(sub.startMs) . " --> " . TimeConverter.MsToSRT(sub.endMs) . "`r`n"
            content .= sub.text . "`r`n`r`n"
        }
    }
    else if (format = "vtt") {
        content := "WEBVTT`r`n`r`n"
        for sub in subtitleLines {
            content .= TimeConverter.MsToVTT(sub.startMs) . " --> " . TimeConverter.MsToVTT(sub.endMs) . "`r`n"
            content .= sub.text . "`r`n`r`n"
        }
    }
    else if (format = "sbv") {
        for sub in subtitleLines {
            content .= TimeConverter.MsToSBV(sub.startMs) . "," . TimeConverter.MsToSBV(sub.endMs) . "`r`n"
            content .= sub.text . "`r`n`r`n"
        }
    }
    else if (format = "txt") {
        for sub in subtitleLines {
            timeStr := SubStr(TimeConverter.MsToSRT(sub.startMs), 1, 8)
            content .= "[" . timeStr . "] " . sub.text . "`r`n"
        }
    }
    else if (format = "ass") {
        content := "[Script Info]`r`n"
        content .= "Title: Subtitle`r`n"
        content .= "ScriptType: v4.00+`r`n`r`n"
        content .= "[V4+ Styles]`r`n"
        content .= "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`r`n"
        content .= "Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1`r`n`r`n"
        content .= "[Events]`r`n"
        content .= "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`r`n"
        
        for sub in subtitleLines {
            startTime := FormatASSTime(sub.startMs)
            endTime := FormatASSTime(sub.endMs)
            text := StrReplace(sub.text, "`n", "\N")
            content .= "Dialogue: 0," . startTime . "," . endTime . ",Default,,0,0,0,," . text . "`r`n"
        }
    }
    
    return content
}

FormatASSTime(ms) {
    h := Floor(ms / 3600000)
    m := Floor(Mod(ms, 3600000) / 60000)
    s := Floor(Mod(ms, 60000) / 1000)
    cs := Floor(Mod(ms, 1000) / 10)
    return Format("{:d}:{:02d}:{:02d}.{:02d}", h, m, s, cs)
}

ImportFromScript(*) {
    if (scriptLines.Length = 0) {
        MsgBox("대본 송출 탭에 내용이 없습니다.", "알림", "Icon!")
        return
    }
    
    hasTimestamp := false
    for line in scriptLines {
        if (RegExMatch(line, "\[(\d{2}:\d{2}:\d{2})\]")) {
            hasTimestamp := true
            break
        }
    }
    
    if (!hasTimestamp) {
        MsgBox("대본에 타임스탬프가 없습니다.", "알림", "Icon!")
        return
    }
    
    SaveUndoState()
    
    global subtitleLines := []
    
    for i, line in scriptLines {
        if (RegExMatch(line, "\[(\d{2}:\d{2}:\d{2})\]\s*(.*)", &m)) {
            sub := SubtitleLine()
            sub.index := subtitleLines.Length + 1
            sub.startMs := TimeConverter.SRTtoMs(m[1] . ",000")
            sub.text := m[2]
            
            if (i < scriptLines.Length) {
                nextTime := 0
                Loop (scriptLines.Length - i) {
                    nextLine := scriptLines[i + A_Index]
                    if (RegExMatch(nextLine, "\[(\d{2}:\d{2}:\d{2})\]", &nextMatch)) {
                        nextTime := TimeConverter.SRTtoMs(nextMatch[1] . ",000")
                        break
                    }
                }
                
                if (nextTime > 0) {
                    sub.endMs := nextTime - 100
                } else {
                    sub.endMs := sub.startMs + 3000
                }
            } else {
                sub.endMs := sub.startMs + 3000
            }
            
            if (sub.text != "") {
                subtitleLines.Push(sub)
            }
        }
    }
    
    UpdateSubtitleListView()
    UpdateSubtitlePopupListView()
    global subtitleModified := true
    lblSubtitleStatus.Text := "대본에서 " . subtitleLines.Length . "개 자막 가져옴"
    ShowModernTooltip(subtitleLines.Length . "개의 자막을 가져왔습니다.", 1500)
}

; ############################################
; #       대본 송출 관련 함수들              #
; ############################################
UpdateScriptAutoNewline() {
    global scriptAutoNewline := chkScriptAutoNewline.Value
    SaveSettings()
    
    if (scriptAutoNewline) {
        ShowModernTooltip("대본 송출 시 자동 줄바꿈 ON", 1000)
    } else {
        ShowModernTooltip("대본 송출 시 자동 줄바꿈 OFF", 1000)
    }
}

ToggleScriptAutoNewline(*) {
    global scriptAutoNewline := !scriptAutoNewline
    
    if (IsObject(chkScriptAutoNewline)) {
        chkScriptAutoNewline.Value := scriptAutoNewline
    }
    
    UpdateScriptAutoNewline()
}

SearchScript(*) {
    global scriptSearchResults := []
    global currentSearchIndex := 0
    
    searchText := Trim(scriptSearchInput.Text)
    if (searchText = "") {
        UpdateScriptListView()
        return
    }
    
    searchTextLower := StrLower(searchText)
    
    Loop scriptLines.Length {
        if (InStr(StrLower(scriptLines[A_Index]), searchTextLower)) {
            scriptSearchResults.Push(A_Index)
        }
    }
    
    if (scriptSearchResults.Length > 0) {
        currentSearchIndex := 1
        JumpToSearchResult(scriptSearchResults[1])
        ShowModernTooltip(scriptSearchResults.Length . "개 찾음", 1000)
    } else {
        ShowModernTooltip("검색 결과 없음", 1000)
    }
}

SearchNext(*) {
    if (scriptSearchResults.Length = 0) {
        SearchScript()
        return
    }
    
    global currentSearchIndex := currentSearchIndex + 1
    if (currentSearchIndex > scriptSearchResults.Length) {
        currentSearchIndex := 1
    }
    
    JumpToSearchResult(scriptSearchResults[currentSearchIndex])
    ShowModernTooltip(currentSearchIndex . "/" . scriptSearchResults.Length, 800)
}

SearchPrevious(*) {
    if (scriptSearchResults.Length = 0) {
        SearchScript()
        return
    }
    
    global currentSearchIndex := currentSearchIndex - 1
    if (currentSearchIndex < 1) {
        currentSearchIndex := scriptSearchResults.Length
    }
    
    JumpToSearchResult(scriptSearchResults[currentSearchIndex])
    ShowModernTooltip(currentSearchIndex . "/" . scriptSearchResults.Length, 800)
}

JumpToSearchResult(lineIndex) {
    global currentLineIndex := lineIndex
    UpdateScriptStatus()
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(lineIndex, "Select Focus Vis")
        scriptListView.Modify(lineIndex, "+Check")
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(lineIndex, "Select Focus Vis")
    }
}

; ############################################
; #       스크립트 팝업창 함수들             #
; ############################################
ShowScriptPopup(*) {
    if (IsObject(scriptPopupGui) && scriptPopupGui.Hwnd) {
        try {
            scriptPopupGui.Show()
            return
        }
    }
    
    global scriptPopupGui := Gui("+Resize", "대본 송출 목록")
    scriptPopupGui.BackColor := Format("{:06X}", VSColors.bg)
    
    scriptPopupGui.AddText("x10 y10 w35 c" . Format("{:06X}", VSColors.text), "검색:")
    global scriptPopupSearchInput := scriptPopupGui.AddEdit("x50 y8 w150 h24 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text), "")
    scriptPopupSearchInput.SetFont("s9", "Segoe UI")
    scriptPopupSearchInput.OnEvent("Change", (*) => PopupSearchScript())
    
    global scriptPopupSearchPrev := scriptPopupGui.AddText("x205 y8 w30 h24 Center 0x200 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " Border", "◀")
    scriptPopupSearchPrev.SetFont("s10", "Segoe UI")
    scriptPopupSearchPrev.OnEvent("Click", PopupSearchPrevious)
    
    global scriptPopupSearchNext := scriptPopupGui.AddText("x240 y8 w30 h24 Center 0x200 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " Border", "▶")
    scriptPopupSearchNext.SetFont("s10", "Segoe UI")
    scriptPopupSearchNext.OnEvent("Click", PopupSearchNext)
    
    scriptPopupGui.AddText("x275 y10 w200 c" . Format("{:06X}", VSColors.textSecondary), "(Ctrl+F: 검색 / Esc: 검색 취소)")
    scriptPopupGui.SetFont("s8", "Segoe UI")
    
    global scriptPopupListView := scriptPopupGui.AddListView("x10 y40 w780 h450 Background" . Format("{:06X}", VSColors.bg) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000 +LV0x1", ["번호", "상태", "내용"])
    scriptPopupListView.SetFont("s10", "Segoe UI")
    scriptPopupListView.ModifyCol(1, 60)
    scriptPopupListView.ModifyCol(2, 60)
    scriptPopupListView.ModifyCol(3, 640)
    scriptPopupListView.OnEvent("DoubleClick", EditScriptLineInPopup)
    scriptPopupListView.OnEvent("Click", OnScriptListClickInPopup)
    
    global scriptPopupStatus := scriptPopupGui.AddText("x10 y500 w780 h25 c" . Format("{:06X}", VSColors.text), "")
    scriptPopupStatus.SetFont("s9", "Segoe UI")
    
    scriptPopupGui.OnEvent("Size", OnScriptPopupResize)
    scriptPopupGui.OnEvent("Close", CloseScriptPopup)
    
    HotIfWinActive("ahk_id " . scriptPopupGui.Hwnd)
    try {
        Hotkey("^f", PopupSearchFocus)
        Hotkey("Escape", PopupEscapeHandler)
        Hotkey("Enter", PopupEnterHandler)
    } catch as err {
    }
    HotIfWinActive()
    
    popupWidth := Integer(IniRead(settingsFile, "ScriptPopup", "Width", 800))
    popupHeight := Integer(IniRead(settingsFile, "ScriptPopup", "Height", 540))
    popupX := IniRead(settingsFile, "ScriptPopup", "X", "")
    popupY := IniRead(settingsFile, "ScriptPopup", "Y", "")
    
    UpdateScriptPopupListView()
    
    if (popupX != "" && popupY != "") {
        scriptPopupGui.Show("w" . popupWidth . " h" . popupHeight . " x" . popupX . " y" . popupY)
    } else {
        scriptPopupGui.Show("w" . popupWidth . " h" . popupHeight)
    }
}

OnScriptPopupResize(gui, MinMax, Width, Height) {
    if (MinMax = -1) {
        return
    }
    
    newListWidth := Width - 20
    newListHeight := Height - 100
    
    scriptPopupListView.Move(10, 40, newListWidth, newListHeight)
    
    col1Width := 60
    col2Width := 60
    col3Width := newListWidth - col1Width - col2Width - 20
    
    scriptPopupListView.ModifyCol(1, col1Width)
    scriptPopupListView.ModifyCol(2, col2Width)
    scriptPopupListView.ModifyCol(3, col3Width)
    
    gui.GetClientPos(, , &clientWidth, &clientHeight)
    statusY := clientHeight - 30
    
    if (IsObject(scriptPopupStatus) && scriptPopupStatus.Hwnd) {
        scriptPopupStatus.Move(10, statusY, clientWidth - 20)
    }
    
    if (MinMax = 0) {
        gui.GetPos(&guiX, &guiY)
        IniWrite(Width, settingsFile, "ScriptPopup", "Width")
        IniWrite(Height, settingsFile, "ScriptPopup", "Height")
        IniWrite(guiX, settingsFile, "ScriptPopup", "X")
        IniWrite(guiY, settingsFile, "ScriptPopup", "Y")
    }
}

UpdateScriptPopupListView() {
    if (!IsObject(scriptPopupListView) || !scriptPopupListView.Hwnd) {
        return
    }
    
    scriptPopupListView.Delete()
    
    popupSearchText := ""
    if (IsObject(scriptPopupSearchInput) && scriptPopupSearchInput.Text != "") {
        popupSearchText := StrLower(Trim(scriptPopupSearchInput.Text))
    }
    
    Loop scriptLines.Length {
        status := (A_Index = currentLineIndex) ? "▶" : "○"
        content := scriptLines[A_Index]
        
        if (popupSearchText != "" && InStr(StrLower(content), popupSearchText)) {
            content := "🔍 " . content
        }
        
        scriptPopupListView.Add("", A_Index, status, content)
    }
    
    if (currentLineIndex > 0 && currentLineIndex <= scriptLines.Length) {
        scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    if (IsObject(scriptPopupStatus) && scriptPopupStatus.Hwnd) {
        if (scriptLines.Length > 0) {
            statusText := "총 " . scriptLines.Length . "줄 | 현재: " . currentLineIndex . "줄"
            if (popupSearchText != "" && scriptPopupSearchResults.Length > 0) {
                statusText .= " | 검색: " . scriptPopupSearchResults.Length . "개"
            }
            scriptPopupStatus.Text := statusText
        } else {
            scriptPopupStatus.Text := "대본 없음"
        }
    }
}

CloseScriptPopup(*) {
    if (IsObject(scriptPopupGui) && scriptPopupGui.Hwnd) {
        HotIfWinActive("ahk_id " . scriptPopupGui.Hwnd)
        try {
            Hotkey("^f", "Off")
            Hotkey("Escape", "Off")
            Hotkey("Enter", "Off")
        } catch {
        }
        HotIfWinActive()
    }
    
    global scriptPopupGui := ""
    global scriptPopupListView := ""
    global scriptPopupStatus := ""
    global scriptPopupSearchInput := ""
    global scriptPopupSearchPrev := ""
    global scriptPopupSearchNext := ""
    global scriptPopupSearchResults := []
    global currentPopupSearchIndex := 0
}

PopupSearchScript(*) {
    global scriptPopupSearchResults := []
    global currentPopupSearchIndex := 0
    
    searchText := Trim(scriptPopupSearchInput.Text)
    if (searchText = "") {
        UpdateScriptPopupListView()
        return
    }
    
    searchTextLower := StrLower(searchText)
    
    Loop scriptLines.Length {
        if (InStr(StrLower(scriptLines[A_Index]), searchTextLower)) {
            scriptPopupSearchResults.Push(A_Index)
        }
    }
    
    if (scriptPopupSearchResults.Length > 0) {
        currentPopupSearchIndex := 1
        PopupJumpToSearchResult(scriptPopupSearchResults[1])
        ShowModernTooltip(scriptPopupSearchResults.Length . "개 찾음", 1000)
    } else {
        ShowModernTooltip("검색 결과 없음", 1000)
        UpdateScriptPopupListView()
    }
}

PopupSearchNext(*) {
    if (scriptPopupSearchResults.Length = 0) {
        PopupSearchScript()
        return
    }
    
    global currentPopupSearchIndex := currentPopupSearchIndex + 1
    if (currentPopupSearchIndex > scriptPopupSearchResults.Length) {
        currentPopupSearchIndex := 1
    }
    
    PopupJumpToSearchResult(scriptPopupSearchResults[currentPopupSearchIndex])
    ShowModernTooltip(currentPopupSearchIndex . "/" . scriptPopupSearchResults.Length, 800)
}

PopupSearchPrevious(*) {
    if (scriptPopupSearchResults.Length = 0) {
        PopupSearchScript()
        return
    }
    
    global currentPopupSearchIndex := currentPopupSearchIndex - 1
    if (currentPopupSearchIndex < 1) {
        currentPopupSearchIndex := scriptPopupSearchResults.Length
    }
    
    PopupJumpToSearchResult(scriptPopupSearchResults[currentPopupSearchIndex])
    ShowModernTooltip(currentPopupSearchIndex . "/" . scriptPopupSearchResults.Length, 800)
}

PopupJumpToSearchResult(lineIndex) {
    global currentLineIndex := lineIndex
    UpdateScriptStatus()
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(lineIndex, "Select Focus Vis")
        scriptPopupListView.Modify(lineIndex, "+Check")
    }
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(lineIndex, "Select Focus Vis")
    }
}

PopupSearchFocus(*) {
    if (IsObject(scriptPopupSearchInput) && scriptPopupSearchInput.Hwnd) {
        scriptPopupSearchInput.Focus()
        scriptPopupSearchInput.Text := ""
    }
}

PopupEscapeHandler(*) {
    try {
        focused := scriptPopupGui.FocusedCtrl
        
        if (focused = scriptPopupSearchInput) {
            scriptPopupSearchInput.Text := ""
            global scriptPopupSearchResults := []
            global currentPopupSearchIndex := 0
            UpdateScriptPopupListView()
            scriptPopupListView.Focus()
            return
        }
    }
    
    Send("{Escape}")
}

PopupEnterHandler(*) {
    try {
        focused := scriptPopupGui.FocusedCtrl
        
        if (focused = scriptPopupSearchInput) {
            PopupSearchNext()
            return
        }
    }
    
    Send("{Enter}")
}

; ############################################
; #       화자/상용구 팝업창 함수들          #
; ############################################
ShowSpeakerPopup(*) {
    if (IsObject(speakerPopupGui) && speakerPopupGui.Hwnd) {
        try {
            speakerPopupGui.Show()
            return
        }
    }
    
    global speakerPopupGui := Gui("+Resize", "화자 목록")
    speakerPopupGui.BackColor := Format("{:06X}", VSColors.bg)
    
    global speakerPopupListView := speakerPopupGui.AddListView("x10 y10 w780 h480 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["번호", "이름", "단축키", "형식 예시"])
    speakerPopupListView.SetFont("s10", "Segoe UI")
    speakerPopupListView.ModifyCol(1, 60)
    speakerPopupListView.ModifyCol(2, 200)
    speakerPopupListView.ModifyCol(3, 150)
    speakerPopupListView.ModifyCol(4, 350)
    speakerPopupListView.OnEvent("DoubleClick", EditSpeakerInPopup)
    
    global speakerPopupStatus := speakerPopupGui.AddText("x10 y500 w780 h25 c" . Format("{:06X}", VSColors.text), "")
    speakerPopupStatus.SetFont("s9", "Segoe UI")
    
    speakerPopupGui.OnEvent("Size", OnSpeakerPopupResize)
    speakerPopupGui.OnEvent("Close", CloseSpeakerPopup)
    
    popupWidth := Integer(IniRead(settingsFile, "SpeakerPopup", "Width", 800))
    popupHeight := Integer(IniRead(settingsFile, "SpeakerPopup", "Height", 540))
    popupX := IniRead(settingsFile, "SpeakerPopup", "X", "")
    popupY := IniRead(settingsFile, "SpeakerPopup", "Y", "")
    
    UpdateSpeakerPopupListView()
    
    if (popupX != "" && popupY != "") {
        speakerPopupGui.Show("w" . popupWidth . " h" . popupHeight . " x" . popupX . " y" . popupY)
    } else {
        speakerPopupGui.Show("w" . popupWidth . " h" . popupHeight)
    }
}

OnSpeakerPopupResize(gui, MinMax, Width, Height) {
    if (MinMax = -1) {
        return
    }
    
    newListWidth := Width - 20
    newListHeight := Height - 60
    speakerPopupListView.Move(10, 10, newListWidth, newListHeight)
    
    col1Width := 60
    col2Width := Integer(newListWidth * 0.25)
    col3Width := Integer(newListWidth * 0.19)
    col4Width := newListWidth - col1Width - col2Width - col3Width - 20
    
    speakerPopupListView.ModifyCol(1, col1Width)
    speakerPopupListView.ModifyCol(2, col2Width)
    speakerPopupListView.ModifyCol(3, col3Width)
    speakerPopupListView.ModifyCol(4, col4Width)
    
    gui.GetClientPos(, , &clientWidth, &clientHeight)
    statusY := clientHeight - 30
    
    if (IsObject(speakerPopupStatus) && speakerPopupStatus.Hwnd) {
        speakerPopupStatus.Move(10, statusY, clientWidth - 20)
    }
    
    if (MinMax = 0) {
        gui.GetPos(&guiX, &guiY)
        IniWrite(Width, settingsFile, "SpeakerPopup", "Width")
        IniWrite(Height, settingsFile, "SpeakerPopup", "Height")
        IniWrite(guiX, settingsFile, "SpeakerPopup", "X")
        IniWrite(guiY, settingsFile, "SpeakerPopup", "Y")
    }
}

UpdateSpeakerPopupListView() {
    if (!IsObject(speakerPopupListView) || !speakerPopupListView.Hwnd) {
        return
    }
    
    speakerPopupListView.Delete()
    
    circleNumbers := ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]
    
    Loop speakers.Length {
        num := circleNumbers[A_Index]
        name := speakers[A_Index].name
        shortcut := "Insert+" . A_Index
        
        formatExample := speakerPrefix . name . speakerSuffix
        formatExample := StrReplace(formatExample, "`t", "→탭")
        
        if (speakerAutoNewline) {
            formatExample := "↵" . formatExample
        }
        
        speakerPopupListView.Add("", num, name, shortcut, formatExample)
    }
    
    if (IsObject(speakerPopupStatus) && speakerPopupStatus.Hwnd) {
        speakerPopupStatus.Text := "총 " . speakers.Length . "/9명 등록"
    }
}

CloseSpeakerPopup(*) {
    global speakerPopupGui := ""
    global speakerPopupListView := ""
    global speakerPopupStatus := ""
}

ShowPhrasePopup(*) {
    if (IsObject(phrasePopupGui) && phrasePopupGui.Hwnd) {
        try {
            phrasePopupGui.Show()
            return
        }
    }
    
    global phrasePopupGui := Gui("+Resize", "상용구 목록")
    phrasePopupGui.BackColor := Format("{:06X}", VSColors.bg)
    
    global phrasePopupListView := phrasePopupGui.AddListView("x10 y10 w780 h480 Background" . Format("{:06X}", VSColors.bgTertiary) . " c" . Format("{:06X}", VSColors.text) . " -Theme +LV0x10000", ["키", "내용", "사용횟수"])
    phrasePopupListView.SetFont("s10", "Segoe UI")
    phrasePopupListView.ModifyCol(1, 100)
    phrasePopupListView.ModifyCol(2, 580)
    phrasePopupListView.ModifyCol(3, 80)
    phrasePopupListView.OnEvent("DoubleClick", EditPhraseInPopup)
    
    global phrasePopupStatus := phrasePopupGui.AddText("x10 y500 w780 h25 c" . Format("{:06X}", VSColors.text), "")
    phrasePopupStatus.SetFont("s9", "Segoe UI")
    
    phrasePopupGui.OnEvent("Size", OnPhrasePopupResize)
    phrasePopupGui.OnEvent("Close", ClosePhrasePopup)
    
    popupWidth := Integer(IniRead(settingsFile, "PhrasePopup", "Width", 800))
    popupHeight := Integer(IniRead(settingsFile, "PhrasePopup", "Height", 540))
    popupX := IniRead(settingsFile, "PhrasePopup", "X", "")
    popupY := IniRead(settingsFile, "PhrasePopup", "Y", "")
    
    UpdatePhrasePopupListView()
    
    if (popupX != "" && popupY != "") {
        phrasePopupGui.Show("w" . popupWidth . " h" . popupHeight . " x" . popupX . " y" . popupY)
    } else {
        phrasePopupGui.Show("w" . popupWidth . " h" . popupHeight)
    }
}

OnPhrasePopupResize(gui, MinMax, Width, Height) {
    if (MinMax = -1) {
        return
    }
    
    newListWidth := Width - 20
    newListHeight := Height - 60
    phrasePopupListView.Move(10, 10, newListWidth, newListHeight)
    
    col1Width := 100
    col3Width := 80
    col2Width := newListWidth - col1Width - col3Width - 20
    
    phrasePopupListView.ModifyCol(1, col1Width)
    phrasePopupListView.ModifyCol(2, col2Width)
    phrasePopupListView.ModifyCol(3, col3Width)
    
    gui.GetClientPos(, , &clientWidth, &clientHeight)
    statusY := clientHeight - 30
    
    if (IsObject(phrasePopupStatus) && phrasePopupStatus.Hwnd) {
        phrasePopupStatus.Move(10, statusY, clientWidth - 20)
    }
    
    if (MinMax = 0) {
        gui.GetPos(&guiX, &guiY)
        IniWrite(Width, settingsFile, "PhrasePopup", "Width")
        IniWrite(Height, settingsFile, "PhrasePopup", "Height")
        IniWrite(guiX, settingsFile, "PhrasePopup", "X")
        IniWrite(guiY, settingsFile, "PhrasePopup", "Y")
    }
}

UpdatePhrasePopupListView() {
    if (!IsObject(phrasePopupListView) || !phrasePopupListView.Hwnd) {
        return
    }
    
    phrasePopupListView.Delete()
    
    for key, data in phrases {
        content := data.content
        count := data.HasProp("count") ? data.count : 0
        phrasePopupListView.Add("", key, content, count)
    }
    
    if (IsObject(phrasePopupStatus) && phrasePopupStatus.Hwnd) {
        phrasePopupStatus.Text := "총 " . phrases.Count . "개 등록"
    }
}

ClosePhrasePopup(*) {
    global phrasePopupGui := ""
    global phrasePopupListView := ""
    global phrasePopupStatus := ""
}

OnScriptListClick(*) {
    selected := 0
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        selected := scriptListView.GetNext()
        if (selected > 0) {
            global currentLineIndex := selected
            UpdateScriptStatus()
        }
    }
}

OnScriptListClickInPopup(*) {
    selected := 0
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        selected := scriptPopupListView.GetNext()
        if (selected > 0) {
            global currentLineIndex := selected
            UpdateScriptStatus()
        }
    }
}

; ############################################
; #       드래그&드롭 및 대본 송출 함수      #
; ############################################
OnDropFiles(gui, ctrl, fileArray, x, y) {
    if (tabControl.Value != 3) {
        return
    }
    
    if (fileArray.Length > 1) {
        ShowModernTooltip("첫 번째 파일만 처리됩니다.", 1500)
    }
    
    if (fileArray.Length > 0) {
        filePath := fileArray[1]
        
        if (StrLower(SubStr(filePath, -4)) != ".txt") {
            ShowModernTooltip("텍스트 파일(.txt)만 지원합니다.", 2000)
            return
        }
        
        if (scriptLines.Length > 0) {
            result := MsgBox("기존 대본을 교체하시겠습니까?", "확인", "YesNo Icon?")
            if (result = "No") {
                return
            }
        }
        
        try {
            fileContent := FileRead(filePath, "UTF-8")
            ProcessScriptText(fileContent)
            
            SplitPath(filePath, &fileName)
            ShowModernTooltip("파일 로드: " . fileName, 1500)
        } catch as err {
            MsgBox("파일을 읽는 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
        }
    }
}

OnPunctuationChange(*) {
    if (scriptLines.Length > 0) {
        OnSplitMethodChange()
    }
}

ApplyPunctuationSplit() {
    global scriptLines
    newLines := []
    
    for line in scriptLines {
        tempText := line
        
        tempText := StrReplace(tempText, ". ", ".☆")
        tempText := StrReplace(tempText, "! ", "!☆")
        tempText := StrReplace(tempText, "? ", "?☆")
        tempText := StrReplace(tempText, "; ", ";☆")
        
        tempText := StrReplace(tempText, ".", ".☆")
        tempText := StrReplace(tempText, "!", "!☆")
        tempText := StrReplace(tempText, "?", "?☆")
        tempText := StrReplace(tempText, ";", ";☆")
        
        tempText := StrReplace(tempText, " / ", "☆")
        tempText := StrReplace(tempText, "/", "☆")
        tempText := StrReplace(tempText, " | ", "☆")
        tempText := StrReplace(tempText, "|", "☆")
        
        splitParts := StrSplit(tempText, "☆")
        for part in splitParts {
            part := StrReplace(part, "`r", "")
            part := StrReplace(part, "`n", "")
            part := LTrim(part)
            if (part != "") {
                newLines.Push(part)
            }
        }
    }
    
    scriptLines := newLines
}

OnCustomCharChange(*) {
    if (customCharInput.Text != "" && splitMethodDDL.Text != "사용자 지정") {
        splitMethodDDL.Choose(8)
    }
}

AddScriptLine(*) {
    global scriptLines
    scriptLines.Push("")
    
    global scriptSearchResults := []
    global currentSearchIndex := 0
    
    UpdateScriptListView()
    
    newIndex := scriptLines.Length
    scriptListView.Modify(newIndex, "Select Focus")
    EditScriptLine()
}

DeleteScriptLine(*) {
    selected := scriptListView.GetNext()
    if (!selected) {
        MsgBox("삭제할 줄을 선택하세요.", "알림", "Icon!")
        return
    }
    
    global scriptLines
    scriptLines.RemoveAt(selected)
    
    global currentLineIndex
    if (currentLineIndex > scriptLines.Length) {
        currentLineIndex := scriptLines.Length
    }
    if (currentLineIndex < 1 && scriptLines.Length > 0) {
        currentLineIndex := 1
    }
    
    global scriptSearchResults := []
    global currentSearchIndex := 0
    
    UpdateScriptListView()
    UpdateScriptStatus()
}

EditScriptLine(*) {
    selected := scriptListView.GetNext()
    if (!selected) {
        return
    }
    
    currentText := ""
    if (selected <= scriptLines.Length) {
        currentText := scriptLines[selected]
    }
    
    scriptListView.GetPos(&lvX, &lvY, &lvW, &lvH)
    
    editY := lvY + 20 + (selected - 1) * 20
    editX := lvX + 120
    editW := lvW - 120
    
    global hiddenEdit
    hiddenEdit.Text := currentText
    hiddenEdit.Move(editX, editY, editW, 20)
    hiddenEdit.Visible := true
    hiddenEdit.Focus()
    
    global editingLineIndex := selected
}

FinishEditScriptLine(*) {
    global hiddenEdit, editingLineIndex, scriptLines
    
    if (!hiddenEdit.Visible) {
        return
    }
    
    newText := hiddenEdit.Text
    newText := StrReplace(newText, "`r", "")
    newText := StrReplace(newText, "`n", "")
    newText := LTrim(newText)
    
    if (editingLineIndex > 0 && editingLineIndex <= scriptLines.Length) {
        scriptLines[editingLineIndex] := newText
        
        global scriptSearchResults := []
        global currentSearchIndex := 0
    }
    
    hiddenEdit.Visible := false
    hiddenEdit.Move(0, 0, 0, 0)
    
    UpdateScriptListView()
    
    editingLineIndex := 0
}

ProcessScriptText(text := "") {
    if (text = "") {
        if (A_Clipboard = "") {
            return
        }
        text := A_Clipboard
    }
    
    text := StrReplace(text, "`r`n", "`n")
    text := StrReplace(text, "`r", "`n")
    
    while (InStr(text, "`n`n")) {
        text := StrReplace(text, "`n`n", "`n")
    }
    
    scriptListView.Opt("-Redraw")
    
    splitMethod := splitMethodDDL.Text
    
    global scriptLines := []
    
    if (splitMethod = "사용자 지정") {
        if (customCharInput.Text = "") {
            ShowModernTooltip("사용자 지정 글자수를 입력하세요.", 1500)
            customCharInput.Focus()
            scriptListView.Opt("+Redraw")
            return
        }
        
        charLimit := 50
        inputValue := Trim(customCharInput.Text)
        
        if (!IsNumber(inputValue)) {
            ShowModernTooltip("숫자만 입력하세요.", 1500)
            scriptListView.Opt("+Redraw")
            return
        }
        
        charLimit := Integer(inputValue)
        if (charLimit < 10) {
            ShowModernTooltip("최소 10자 이상으로 설정합니다.", 1500)
            charLimit := 10
        } else if (charLimit > 100) {
            ShowModernTooltip(charLimit . "자로 설정. 100자 이상은 주의가 필요합니다.", 1500)
        }
        
        text := StrReplace(text, "`r`n", " ")
        text := StrReplace(text, "`n", " ")
        
        while (StrLen(text) > 0) {
            if (StrLen(text) <= charLimit) {
                text := StrReplace(text, "`r", "")
                text := StrReplace(text, "`n", "")
                text := RTrim(LTrim(text))
                if (text != "") {
                    scriptLines.Push(text)
                }
                break
            }
            
            cutPos := charLimit
            minPos := Integer(charLimit * 0.6)
            
            while (cutPos > minPos && SubStr(text, cutPos, 1) != " ") {
                cutPos := cutPos - 1
            }
            
            if (cutPos <= minPos) {
                cutPos := charLimit
            }
            
            cutText := SubStr(text, 1, cutPos)
            cutText := StrReplace(cutText, "`r", "")
            cutText := StrReplace(cutText, "`n", "")
            cutText := LTrim(cutText)
            if (cutText != "") {
                scriptLines.Push(cutText)
            }
            
            text := SubStr(text, cutPos + 1)
        }
        
        if (chkPunctuation.Value) {
            ApplyPunctuationSplit()
        }
    }
    else if (InStr(splitMethod, "자 단위")) {
        charLimit := 50
        if (splitMethod = "30자 단위") {
            charLimit := 30
        } else if (splitMethod = "40자 단위") {
            charLimit := 40
        } else if (splitMethod = "60자 단위") {
            charLimit := 60
        }
        
        text := StrReplace(text, "`r`n", " ")
        text := StrReplace(text, "`n", " ")
        
        while (StrLen(text) > 0) {
            if (StrLen(text) <= charLimit) {
                text := StrReplace(text, "`r", "")
                text := StrReplace(text, "`n", "")
                text := RTrim(LTrim(text))
                if (text != "") {
                    scriptLines.Push(text)
                }
                break
            }
            
            cutPos := charLimit
            minPos := Integer(charLimit * 0.6)
            
            while (cutPos > minPos && SubStr(text, cutPos, 1) != " ") {
                cutPos := cutPos - 1
            }
            
            if (cutPos <= minPos) {
                cutPos := charLimit
            }
            
            cutText := SubStr(text, 1, cutPos)
            cutText := StrReplace(cutText, "`r", "")
            cutText := StrReplace(cutText, "`n", "")
            cutText := LTrim(cutText)
            if (cutText != "") {
                scriptLines.Push(cutText)
            }
            
            text := SubStr(text, cutPos + 1)
        }
        
        if (chkPunctuation.Value) {
            ApplyPunctuationSplit()
        }
    }
    else if (splitMethod = "문장 단위") {
        text := StrReplace(text, ". ", ".`n")
        text := StrReplace(text, "! ", "!`n")
        text := StrReplace(text, "? ", "?`n")
        
        lines := StrSplit(text, "`n")
        for line in lines {
            line := StrReplace(line, "`r", "")
            line := StrReplace(line, "`n", "")
            line := LTrim(line)
            if (line != "") {
                scriptLines.Push(line)
            }
        }
        
        if (chkPunctuation.Value) {
            ApplyPunctuationSplit()
        }
    }
    else if (splitMethod = "구두점 단위") {
        text := StrReplace(text, ". ", ".`n")
        text := StrReplace(text, "! ", "!`n")
        text := StrReplace(text, "? ", "?`n")
        text := StrReplace(text, "; ", ";`n")
        
        text := StrReplace(text, ".`n", "☆")
        text := StrReplace(text, ".", ".`n")
        text := StrReplace(text, "☆", ".`n")
        
        text := StrReplace(text, "!`n", "☆")
        text := StrReplace(text, "!", "!`n")
        text := StrReplace(text, "☆", "!`n")
        
        text := StrReplace(text, "?`n", "☆")
        text := StrReplace(text, "?", "?`n")
        text := StrReplace(text, "☆", "?`n")
        
        text := StrReplace(text, ";`n", "☆")
        text := StrReplace(text, ";", ";`n")
        text := StrReplace(text, "☆", ";`n")
        
        text := StrReplace(text, " / ", "`n")
        text := StrReplace(text, "/", "`n")
        text := StrReplace(text, " | ", "`n")
        text := StrReplace(text, "|", "`n")
        
        while (InStr(text, "`n`n")) {
            text := StrReplace(text, "`n`n", "`n")
        }
        
        lines := StrSplit(text, "`n")
        for line in lines {
            line := LTrim(line)
            if (line != "" && line != "`r") {
                scriptLines.Push(line)
            }
        }
    }
    else {
        lines := StrSplit(text, "`n")
        for line in lines {
            line := LTrim(line)
            if (line != "" && line != "`r") {
                scriptLines.Push(line)
            }
        }
        
        if (chkPunctuation.Value && splitMethod = "줄바꿈") {
            ApplyPunctuationSplit()
        }
    }
    
    scriptListView.Opt("+Redraw")
    
    cleanedLines := []
    for line in scriptLines {
        if (line != "") {
            cleanedLines.Push(line)
        }
    }
    scriptLines := cleanedLines
    
    UpdateScriptListView()
    
    global currentLineIndex := 1
    UpdateScriptStatus()
    
    global scriptSearchResults := []
    global currentSearchIndex := 0
    
    if (scriptLines.Length > 0) {
        ShowModernTooltip(scriptLines.Length . "개의 줄이 로드되었습니다.", 1500)
    }
}

ClearScript(*) {
    result := MsgBox("대본을 모두 지우시겠습니까?", "확인", "YesNo Icon?")
    if (result = "No") {
        return
    }
    
    global scriptLines := []
    global currentLineIndex := 1
    global scriptSearchResults := []
    global currentSearchIndex := 0
    scriptListView.Delete()
    
    if (IsObject(scriptSearchInput)) {
        scriptSearchInput.Text := ""
    }
    
    UpdateScriptStatus()
}

OpenScriptFile(*) {
    selectedFile := FileSelect(1, , "텍스트 파일 선택", "텍스트 파일 (*.txt)")
    if (!selectedFile) {
        return
    }
    
    if (scriptLines.Length > 0) {
        result := MsgBox("기존 대본을 교체하시겠습니까?", "확인", "YesNo Icon?")
        if (result = "No") {
            return
        }
    }
    
    try {
        fileContent := FileRead(selectedFile, "UTF-8")
        ProcessScriptText(fileContent)
        
        SplitPath(selectedFile, &fileName)
        ShowModernTooltip("파일 로드: " . fileName, 1500)
    } catch as err {
        MsgBox("파일을 읽는 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
    }
}

UpdateScriptListView() {
    scriptListView.Delete()
    
    searchText := ""
    if (IsObject(scriptSearchInput) && scriptSearchInput.Text != "") {
        searchText := StrLower(Trim(scriptSearchInput.Text))
    }
    
    Loop scriptLines.Length {
        status := (A_Index = currentLineIndex) ? "▶" : "○"
        content := scriptLines[A_Index]
        
        if (searchText != "" && InStr(StrLower(content), searchText)) {
            content := "🔍 " . content
        }
        
        scriptListView.Add("", A_Index, status, content)
    }
    
    if (currentLineIndex > 0 && currentLineIndex <= scriptLines.Length) {
        scriptListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    UpdateScriptPopupListView()
}

UpdateScriptStatus() {
    if (scriptMode) {
        if (scriptLines.Length > 0) {
            lblScriptStatus.Text := "대본 모드: ON (" . currentLineIndex . "/" . scriptLines.Length . ")"
        } else {
            lblScriptStatus.Text := "대본 모드: ON (대본 없음)"
        }
        lblScriptStatus.SetFont("s11 Bold c" . Format("{:06X}", VSColors.success), "Segoe UI")
    } else {
        lblScriptStatus.Text := "대본 모드: OFF"
        lblScriptStatus.SetFont("s11 Bold c" . Format("{:06X}", VSColors.text), "Segoe UI")
    }
    
    if (IsObject(scriptListView) && scriptListView.Hwnd && scriptLines.Length > 0) {
        scriptListView.Opt("-Redraw")
        
        scriptListView.Modify(0, "-Select")
        
        Loop scriptLines.Length {
            status := (A_Index = currentLineIndex) ? "▶" : "○"
            scriptListView.Modify(A_Index, "Col2", status)
        }
        
        if (currentLineIndex > 0 && currentLineIndex <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex, "Select Focus Vis")
            
            if (currentLineIndex + 3 <= scriptLines.Length) {
                scriptListView.Modify(currentLineIndex + 3, "Vis")
            }
        }
        
        scriptListView.Opt("+Redraw")
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd && scriptLines.Length > 0) {
scriptPopupListView.Opt("-Redraw")
        
        scriptPopupListView.Modify(0, "-Select")
        
        Loop scriptLines.Length {
            status := (A_Index = currentLineIndex) ? "▶" : "○"
            scriptPopupListView.Modify(A_Index, "Col2", status)
        }
        
        if (currentLineIndex > 0 && currentLineIndex <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
            
            if (currentLineIndex + 3 <= scriptLines.Length) {
                scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
            }
        }
        
        scriptPopupListView.Opt("+Redraw")
        
        if (IsObject(scriptPopupStatus) && scriptPopupStatus.Hwnd) {
            scriptPopupStatus.Text := "총 " . scriptLines.Length . "줄 | 현재: " . currentLineIndex . "줄"
        }
    }
}

ToggleScriptMode(*) {
    global scriptMode := !scriptMode
    UpdateScriptStatus()
    
    if (scriptMode) {
        ShowModernTooltip("대본 모드 ON", 1000)
    } else {
        ShowModernTooltip("대본 모드 OFF", 1000)
    }
}

SendScriptLine(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (!scriptMode) {
        return
    }
    
    if (scriptLines.Length = 0) {
        ShowModernTooltip("대본이 없습니다.", 1000)
        return
    }
    
    if (currentLineIndex > scriptLines.Length) {
        ShowModernTooltip("대본의 끝입니다.", 1000)
        return
    }
    
    textToSend := scriptLines[currentLineIndex]
    textToSend := StrReplace(textToSend, "`r", "")
    textToSend := StrReplace(textToSend, "`n", "")
    
    SendText(textToSend)
    
    if (scriptAutoNewline) {
        Send("{Enter}")
    }
    
    if (currentLineIndex < scriptLines.Length) {
        global currentLineIndex := currentLineIndex + 1
    } else {
        ShowModernTooltip("마지막 줄 송출 완료", 1500)
    }
    
    UpdateScriptStatus()
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
}

PrevScriptLine(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (!scriptMode) {
        return
    }
    
    if (currentLineIndex <= 1) {
        ShowModernTooltip("첫 번째 줄입니다.", 1000)
        return
    }
    
    global currentLineIndex := currentLineIndex - 1
    
    ShowModernTooltip("이전 줄로: " . currentLineIndex . "/" . scriptLines.Length, 1000)
    
    UpdateScriptStatus()
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
}

NextScriptLine(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (!scriptMode) {
        return
    }
    
    if (currentLineIndex >= scriptLines.Length) {
        ShowModernTooltip("마지막 줄입니다.", 1000)
        return
    }
    
    global currentLineIndex := currentLineIndex + 1
    
    ShowModernTooltip("다음 줄로: " . currentLineIndex . "/" . scriptLines.Length, 1000)
    
    UpdateScriptStatus()
    
    if (IsObject(scriptListView) && scriptListView.Hwnd) {
        scriptListView.Modify(0, "-Select")
        scriptListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
    
    if (IsObject(scriptPopupListView) && scriptPopupListView.Hwnd) {
        scriptPopupListView.Modify(0, "-Select")
        scriptPopupListView.Modify(currentLineIndex, "Select Focus Vis")
        
        if (currentLineIndex + 3 <= scriptLines.Length) {
            scriptPopupListView.Modify(currentLineIndex + 3, "Vis")
        }
    }
}

OnSplitMethodChange(*) {
    global scriptLines
    
    if (splitMethodDDL.Text != "사용자 지정" && customCharInput.Text != "") {
        customCharInput.Text := ""
    }
    
    if (splitMethodDDL.Text = "사용자 지정") {
        customCharInput.Focus()
    }
    
    if (scriptLines.Length > 0) {
        combinedText := ""
        for line in scriptLines {
            if (line != "") {
                if (combinedText != "") {
                    combinedText .= " " . line
                } else {
                    combinedText := line
                }
            }
        }
        
        if (combinedText != "") {
            ProcessScriptText(combinedText)
        }
    }
}

; ############################################
; #       화자 관리 함수                     #
; ############################################
AddSpeaker(*) {
    if (speakers.Length >= 9) {
        MsgBox("화자는 최대 9명까지만 추가할 수 있습니다.", "제한", "Icon!")
        return
    }
    
    ib := InputBox("화자 이름을 입력하세요:", "화자 추가", "w300 h120")
    if (ib.Result != "OK" || ib.Value = "") {
        return
    }
    
    newSpeaker := {
        name: ib.Value,
        number: speakers.Length + 1
    }
    
    speakers.Push(newSpeaker)
    UpdateSpeakerList()
    SaveSettings()
}

EditSpeaker(*) {
    selected := speakerListView.GetNext()
    if (!selected) {
        MsgBox("수정할 화자를 선택하세요.", "알림", "Icon!")
        return
    }
    
    currentName := speakers[selected].name
    ib := InputBox("새 이름을 입력하세요:", "화자 이름 수정", "w300 h120")
    ib.Value := currentName
    
    if (ib.Result = "OK" && ib.Value != "") {
        speakers[selected].name := ib.Value
        UpdateSpeakerList()
        
        speakerListView.Modify(selected, "Select Focus")
        
        SaveSettings()
    }
}

DeleteSpeaker(*) {
    selected := speakerListView.GetNext()
    if (!selected) {
        MsgBox("삭제할 화자를 선택하세요.", "알림", "Icon!")
        return
    }
    
    result := MsgBox("선택한 화자를 삭제하시겠습니까?", "확인", "YesNo Icon?")
    if (result = "No") {
        return
    }
    
    speakers.RemoveAt(selected)
    
    Loop speakers.Length {
        speakers[A_Index].number := A_Index
    }
    
    UpdateSpeakerList()
    SaveSettings()
}

ClearAllSpeakers(*) {
    if (speakers.Length = 0) {
        MsgBox("삭제할 화자가 없습니다.", "알림", "Icon!")
        return
    }
    
    result := MsgBox("모든 화자를 삭제하시겠습니까?", "경고", "YesNo Icon!")
    if (result = "No") {
        return
    }
    
    global speakers := []
    UpdateSpeakerList()
    SaveSettings()
}

MoveSpeakerUp(*) {
    selected := speakerListView.GetNext()
    if (!selected || selected = 1) {
        return
    }
    
    temp := speakers[selected]
    speakers[selected] := speakers[selected - 1]
    speakers[selected - 1] := temp
    
    Loop speakers.Length {
        speakers[A_Index].number := A_Index
    }
    
    UpdateSpeakerList()
    speakerListView.Modify(selected - 1, "Select Focus")
    SaveSettings()
}

MoveSpeakerDown(*) {
    selected := speakerListView.GetNext()
    if (!selected || selected = speakers.Length) {
        return
    }
    
    temp := speakers[selected]
    speakers[selected] := speakers[selected + 1]
    speakers[selected + 1] := temp
    
    Loop speakers.Length {
        speakers[A_Index].number := A_Index
    }
    
    UpdateSpeakerList()
    speakerListView.Modify(selected + 1, "Select Focus")
    SaveSettings()
}

UpdateSpeakerList() {
    speakerListView.Delete()
    
    circleNumbers := ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]
    
    Loop speakers.Length {
        num := circleNumbers[A_Index]
        name := speakers[A_Index].name
        shortcut := "Insert+" . A_Index
        
        formatExample := speakerPrefix . name . speakerSuffix
        formatExample := StrReplace(formatExample, "`t", "→탭")
        
        if (speakerAutoNewline) {
            formatExample := "↵" . formatExample
        }
        
        speakerListView.Add("", num, name, shortcut, formatExample)
    }
    
    UpdateSpeakerPopupListView()
    UpdateStatusBar()
}

UpdateSpeakerFormat(*) {
    global speakerPrefix := edtPrefix.Text
    global speakerSuffix := edtSuffix.Text
    global speakerAutoNewline := chkAutoNewline.Value
    
    UpdateFormatPreview()
    UpdateSpeakerList()
    SaveSettings()
}

UpdateFormatPreview() {
    preview := speakerPrefix . "화자명" . speakerSuffix
    preview := StrReplace(preview, "`t", "→탭")
    if (speakerAutoNewline) {
        preview := "↵" . preview
    }
    lblFormatPreview.Text := preview
}

SetSpeakerFormat(prefix, suffix, newline) {
    edtPrefix.Text := prefix
    edtSuffix.Text := suffix
    chkAutoNewline.Value := newline
    UpdateSpeakerFormat()
}

; ############################################
; #       상용구 관리 함수                   #
; ############################################
AddPhrase(*) {
    text := phraseInput.Text
    if (!InStr(text, ":")) {
        return
    }
    
    parts := StrSplit(text, ":", , 2)
    if (parts.Length < 2 || Trim(parts[1]) = "" || Trim(parts[2]) = "") {
        return
    }
    
    key := Trim(parts[1])
    content := Trim(parts[2])
    
    isUpdate := phrases.Has(key)
    
    phrases[key] := {content: content, count: 0}
    phraseInput.Text := ""
    UpdatePhraseList()
    SaveSettings()
    
    if (isUpdate) {
        ShowModernTooltip("'" . key . "' 수정 완료", 1000)
    } else {
        ShowModernTooltip("'" . key . "' 등록 완료", 1000)
    }
    
    phraseInput.Focus()
}

EditPhrase(*) {
    selected := phraseListView.GetNext()
    if (!selected) {
        MsgBox("수정할 상용구를 선택하세요.", "알림", "Icon!")
        return
    }
    
    key := phraseListView.GetText(selected, 1)
    
    if (!phrases.Has(key)) {
        MsgBox("선택한 상용구를 찾을 수 없습니다.", "오류", "Icon!")
        return
    }
    
    currentData := phrases[key]
    currentContent := currentData.content
    currentCount := currentData.HasProp("count") ? currentData.count : 0
    
    ib := InputBox("새 내용을 입력하세요:`n`n현재: " . currentContent, "상용구 수정 - " . key, "w400 h120")
    
    if (ib.Result = "OK" && ib.Value != "") {
        phrases[key] := {content: ib.Value, count: currentCount}
        
        UpdatePhraseList()
        
        Loop phraseListView.GetCount() {
            if (phraseListView.GetText(A_Index, 1) = key) {
                phraseListView.Modify(A_Index, "Select Focus")
                break
            }
        }
        
        SaveSettings()
        
        if (chkShowTooltips.Value) {
            ShowModernTooltip("상용구 '" . key . "' 수정 완료", 1500)
        }
    }
}

DeletePhrase(*) {
    selected := phraseListView.GetNext()
    if (!selected) {
        MsgBox("삭제할 상용구를 선택하세요.", "알림", "Icon!")
        return
    }
    
    key := phraseListView.GetText(selected, 1)
    
    result := MsgBox("선택한 상용구를 삭제하시겠습니까?`n`n키: " . key, "확인", "YesNo Icon?")
    if (result = "No") {
        return
    }
    
    phrases.Delete(key)
    UpdatePhraseList()
    SaveSettings()
}

ClearAllPhrases(*) {
    if (phrases.Count = 0) {
        MsgBox("삭제할 상용구가 없습니다.", "알림", "Icon!")
        return
    }
    
    result := MsgBox("모든 상용구를 삭제하시겠습니까?", "경고", "YesNo Icon!")
    if (result = "No") {
        return
    }
    
    global phrases := Map()
    UpdatePhraseList()
    SaveSettings()
}

UpdatePhraseList() {
    phraseListView.Delete()
    
    for key, data in phrases {
        content := data.content
        count := data.HasProp("count") ? data.count : 0
        phraseListView.Add("", key, content, count)
    }
    
    UpdatePhrasePopupListView()
    UpdateStatusBar()
}

UpdatePhrasePreview(*) {
    text := phraseInput.Text
    if (InStr(text, ":")) {
        parts := StrSplit(text, ":", , 2)
        if (parts.Length >= 2) {
            phrasePreview.Text := Trim(parts[1]) . " → " . Trim(parts[2])
            return
        }
    }
    phrasePreview.Text := ""
}

ExportPhrases(*) {
    if (phrases.Count = 0) {
        MsgBox("내보낼 상용구가 없습니다.", "알림", "Icon!")
        return
    }
    
    selectedFile := FileSelect("S", "상용구_" . FormatTime(A_Now, "yyyyMMdd") . ".txt", "파일 저장", "텍스트 파일 (*.txt)")
    if (!selectedFile) {
        return
    }
    
    fileContent := ""
    for key, data in phrases {
        fileContent .= key . "`t" . data.content . "`n"
    }
    
    try {
        FileAppend(fileContent, selectedFile, "UTF-8")
        MsgBox("상용구를 성공적으로 내보냈습니다.`n`n파일: " . selectedFile, "성공", "Icon!")
    } catch as err {
        MsgBox("파일 저장 중 오류가 발생했습니다.", "오류", "Icon!")
    }
}

ImportPhrases(*) {
    selectedFile := FileSelect(1, , "텍스트 파일 선택", "텍스트 파일 (*.txt)")
    if (!selectedFile) {
        return
    }
    
    try {
        fileContent := FileRead(selectedFile, "UTF-8")
        lines := StrSplit(fileContent, "`n")
        
        importedCount := 0
        duplicateCount := 0
        
        for line in lines {
            line := Trim(line)
            if (line = "") {
                continue
            }
            
            tabPos := InStr(line, "`t")
            if (tabPos > 0) {
                key := SubStr(line, 1, tabPos - 1)
                content := SubStr(line, tabPos + 1)
            } else {
                spacePos := InStr(line, " ")
                if (spacePos > 0) {
                    key := SubStr(line, 1, spacePos - 1)
                    content := SubStr(line, spacePos + 1)
                } else {
                    continue
                }
            }
            
            if (key != "" && content != "") {
                if (phrases.Has(key)) {
                    duplicateCount := duplicateCount + 1
                }
                phrases[key] := {content: content, count: 0}
                importedCount := importedCount + 1
            }
        }
        
        UpdatePhraseList()
        SaveSettings()
        
        msg := importedCount . "개의 상용구를 불러왔습니다."
        if (duplicateCount > 0) {
            msg .= "`n(" . duplicateCount . "개는 기존 상용구를 덮어씀)"
        }
        MsgBox(msg, "성공", "Icon!")
        
    } catch as err {
        MsgBox("파일을 읽는 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
    }
}

; ############################################
; #       핫키 설정 및 동작                  #
; ############################################
SetupHotkeys() {
    ; F13~F21을 화자 1~9에 매핑
    Loop 9 {
        num := A_Index
        fkey := "F" . (12 + num)
        try {
            Hotkey(fkey, InsertSpeaker.Bind(num))
        } catch as err {
        }
    }
    
    ; 상용구 핫키
    try {
        Hotkey(triggerKey, "Off")
    } catch {
    }
    try {
        Hotkey(triggerKey, TriggerPhrase)
    } catch as err {
        MsgBox("발동키(" . triggerKey . ") 설정 실패: " . err.Message, "오류", "Icon!")
    }
    
    try {
        Hotkey(registerKey, "Off")
    } catch {
    }
    try {
        Hotkey(registerKey, RegisterPhraseFromEditor)
    } catch as err {
        MsgBox("등록키(" . registerKey . ") 설정 실패: " . err.Message, "오류", "Icon!")
    }
    
    try {
        Hotkey("*" . deleteWordKey, "Off")
    } catch {
    }
    try {
        Hotkey("*" . deleteWordKey, DeleteWordBackward)
    } catch as err {
        MsgBox("단어삭제키(" . deleteWordKey . ") 설정 실패: " . err.Message, "오류", "Icon!")
    }
    
    ; 핫키 상태 확인 후 설정
    hotkeyState := Integer(IniRead(settingsFile, "HotkeyStates", "F8", 1))
    if (hotkeyState) {
        try {
            Hotkey("F8", QuickAddSpeaker)
        }
    }
    
    hotkeyState := Integer(IniRead(settingsFile, "HotkeyStates", "F2", 1))
    if (hotkeyState) {
        try {
            Hotkey("F2", InsertTimestamp)
        }
    }
    
    hotkeyState := Integer(IniRead(settingsFile, "HotkeyStates", "F11", 1))
    if (hotkeyState) {
        try {
            Hotkey("F11", ToggleTimer)
        }
    }
    
    hotkeyState := Integer(IniRead(settingsFile, "HotkeyStates", "EnterTimestamp", 1))
    if (hotkeyState) {
        try {
            Hotkey("~Enter", AutoTimestampOnEnter)
        }
    }
    
    ; 대본 송출 핫키 - 수정된 키
    hotkeyState := Integer(IniRead(settingsFile, "HotkeyStates", "ScriptMode", 1))
    if (hotkeyState) {
        try {
            Hotkey("^Numpad7", ToggleScriptMode)
            Hotkey("^NumpadHome", ToggleScriptMode)
        }
    }
    
    hotkeyState := Integer(IniRead(settingsFile, "HotkeyStates", "ScriptSend", 1))
    if (hotkeyState) {
        try {
            Hotkey("^Numpad5", SendScriptLine)
            Hotkey("^NumpadClear", SendScriptLine)
        }
    }
    
    hotkeyState := Integer(IniRead(settingsFile, "HotkeyStates", "ScriptNav", 1))
    if (hotkeyState) {
        try {
            Hotkey("^Numpad8", PrevScriptLine)
            Hotkey("^NumpadUp", PrevScriptLine)
            Hotkey("^Numpad2", NextScriptLine)
            Hotkey("^NumpadDown", NextScriptLine)
        }
    }
    
    hotkeyState := Integer(IniRead(settingsFile, "HotkeyStates", "ScriptNewline", 1))
    if (hotkeyState) {
        try {
            Hotkey("^Numpad9", ToggleScriptAutoNewline)
            Hotkey("^NumpadPgUp", ToggleScriptAutoNewline)
        }
    }
    
    ; 대본 송출 탭에서만 동작하는 핫키
    HotIfWinActive("ahk_id " . mainGui.Hwnd)
    try {
        Hotkey("^v", OnPasteToScript)
        Hotkey("Enter", OnEnterInScriptTab)
        Hotkey("^f", OnSearchHotkey)
        Hotkey("Escape", OnEscapeInScriptTab)
    } catch as err {
    }
    HotIfWinActive()
}

CaptureKey(target) {
    global isCapturingKey := true
    global captureTarget := target
    
    global insert_pressed_time := 0
    
    Sleep(200)
    
    if (target = "trigger") {
        triggerKeyText.Text := "입력대기..."
        triggerKeyText.Opt("c" . Format("{:06X}", VSColors.warning))
    } else if (target = "register") {
        registerKeyText.Text := "입력대기..."
        registerKeyText.Opt("c" . Format("{:06X}", VSColors.warning))
    } else if (target = "deleteWord") {
        deleteWordKeyText.Text := "입력대기..."
        deleteWordKeyText.Opt("c" . Format("{:06X}", VSColors.warning))
    }
    
    SetTimer(CheckKeyPress, 50)
}

CheckKeyPress() {
    if (!isCapturingKey) {
        SetTimer(CheckKeyPress, 0)
        return
    }
    
    if (GetKeyState("LButton", "P") || GetKeyState("RButton", "P") || GetKeyState("MButton", "P")) {
        return
    }
    
    global insert_pressed_time := 0
    
    keys := []
    
    keys.Push("F1", "F3", "F4", "F7", "F10", "F12")
    keys.Push("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M")
    keys.Push("N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z")
    keys.Push("Space", "Tab", "Home", "End", "PgUp", "PgDn", "Insert", "Delete")
    keys.Push("Up", "Down", "Left", "Right")
    keys.Push("Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4")
    keys.Push("Numpad5", "Numpad6", "Numpad7", "Numpad8", "Numpad9")
    keys.Push("NumpadAdd", "NumpadSub", "NumpadMult", "NumpadDiv")
    keys.Push("CapsLock", "ScrollLock", "Pause")
    keys.Push("-", "=", "[", "]", "\", ";", "'", ",", ".", "/", "``")
    keys.Push("1", "2", "3", "4", "5", "6", "7", "8", "9", "0")
    
    for key in keys {
        if (GetKeyState(key, "P")) {
            If (StrLen(key) = 1 && key >= "0" && key <= "9") {
                global insert_pressed_time := 0
                if (GetKeyState("Insert", "P")) {
                    continue
                }
            }
            CaptureComplete(key)
            return
        }
    }
    
    if (GetKeyState("Escape", "P")) {
        global isCapturingKey := false
        if (captureTarget = "trigger") {
            triggerKeyText.Text := triggerKey
            triggerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        } else if (captureTarget = "register") {
            registerKeyText.Text := registerKey
            registerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        } else if (captureTarget = "deleteWord") {
            deleteWordKeyText.Text := deleteWordKey
            deleteWordKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        }
        SetTimer(CheckKeyPress, 0)
    }
}

CaptureComplete(key) {
    global isCapturingKey := false
    
    problematicKeys := ["Tab", "Enter", "Shift", "Ctrl", "Alt", "LWin", "RWin", "Escape", "Insert", "F2", "F5", "F6", "F8", "F11", "Numpad2", "Numpad5", "Numpad7", "Numpad8", "Numpad9"]
    for pKey in problematicKeys {
        if (key = pKey) {
            msg := key . " 키는 "
            if (key = "F2") {
                msg .= "타임스탬프 기능에 할당되어 있습니다."
            } else if (key = "F5" || key = "F11") {
                msg .= "타이머 기능에 할당되어 있습니다."
            } else if (key = "F6" || key = "F8") {
                msg .= "이미 다른 기능에 할당되어 있습니다."
            } else if (key = "Numpad2" || key = "Numpad5" || key = "Numpad7" || key = "Numpad8" || key = "Numpad9") {
                msg .= "대본 송출 기능에 할당되어 있습니다."
            } else {
                msg .= "시스템 키라서 사용할 수 없습니다."
            }
            MsgBox(msg, "경고", "Icon!")
            
            if (captureTarget = "trigger") {
                triggerKeyText.Text := triggerKey
                triggerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
            } else if (captureTarget = "register") {
                registerKeyText.Text := registerKey
                registerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
            } else if (captureTarget = "deleteWord") {
                deleteWordKeyText.Text := deleteWordKey
                deleteWordKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
            }
            SetTimer(CheckKeyPress, 0)
            return
        }
    }
    
    if (captureTarget = "trigger") {
        try {
            Hotkey(triggerKey, "Off")
        } catch {
        }
        
        global triggerKey := key
        triggerKeyText.Text := key
        triggerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        
        Hotkey(triggerKey, TriggerPhrase)
    } else if (captureTarget = "register") {
        try {
            Hotkey(registerKey, "Off")
        } catch {
        }
        
        global registerKey := key
        registerKeyText.Text := key
        registerKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        
        Hotkey(registerKey, RegisterPhraseFromEditor)
    } else if (captureTarget = "deleteWord") {
        try {
            Hotkey("*" . deleteWordKey, "Off")
        } catch {
        }
        
        global deleteWordKey := key
        deleteWordKeyText.Text := key
        deleteWordKeyText.Opt("c" . Format("{:06X}", VSColors.accent))
        
        Hotkey("*" . deleteWordKey, DeleteWordBackward)
    }
    
    SetTimer(CheckKeyPress, 0)
    SaveSettings()
}

ResetHotkeys(*) {
    try {
        Hotkey(triggerKey, "Off")
    } catch {
    }
    try {
        Hotkey(registerKey, "Off")
    } catch {
    }
    try {
        Hotkey("*" . deleteWordKey, "Off")
    } catch {
    }
    
    global triggerKey := "F3"
    global registerKey := "F10"
    global deleteWordKey := "F4"
    
    triggerKeyText.Text := triggerKey
    registerKeyText.Text := registerKey
    deleteWordKeyText.Text := deleteWordKey
    
    SetupHotkeys()
    
    SaveSettings()
    
    ShowModernTooltip("단축키가 초기화되었습니다.", 1500)
}

; 대본 송출 탭 전용 핫키 함수들
OnPasteToScript(*) {
    try {
        focused := mainGui.FocusedCtrl
        if (focused = scriptListView || (IsObject(splitMethodDDL) && focused = splitMethodDDL)) {
            if (A_Clipboard != "") {
                ProcessScriptText(A_Clipboard)
            }
            return
        }
    }
    
    Send("^v")
}

OnEnterInScriptTab(*) {
    try {
        focused := mainGui.FocusedCtrl
        
        if (hiddenEdit.Visible) {
            FinishEditScriptLine()
            return
        }
        
        if (focused = scriptListView) {
            AddScriptLine()
            return
        }
        
        if (focused = customCharInput && customCharInput.Text != "") {
            OnSplitMethodChange()
            return
        }
        
        if (focused = scriptSearchInput) {
            SearchNext()
            return
        }
    }
    
    Send("{Enter}")
}

OnSearchHotkey(*) {
    if (tabControl.Value = 3) {
        scriptSearchInput.Focus()
        scriptSearchInput.Text := ""
        return
    }
    
    Send("^f")
}

OnEscapeInScriptTab(*) {
    try {
        focused := mainGui.FocusedCtrl
        
        if (focused = scriptSearchInput) {
            scriptSearchInput.Text := ""
            global scriptSearchResults := []
            global currentSearchIndex := 0
            UpdateScriptListView()
            scriptListView.Focus()
            return
        }
        
        if (hiddenEdit.Visible) {
            hiddenEdit.Visible := false
            hiddenEdit.Move(0, 0, 0, 0)
            global editingLineIndex := 0
            return
        }
    }
    
    Send("{Escape}")
}

SetupDeleteHotkey() {
    HotIfWinActive("ahk_id " . mainGui.Hwnd)
    Hotkey("Delete", DeleteSelected)
    Hotkey("NumpadDel", DeleteSelected)
    HotIfWinActive()
}

DeleteSelected(*) {
    if (!WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    try {
        focused := mainGui.FocusedCtrl
        
        if (focused = speakerListView) {
            selected := speakerListView.GetNext()
            if (selected) {
                DeleteSpeaker()
            }
            return
        }
        
        if (focused = phraseListView) {
            selected := phraseListView.GetNext()
            if (selected) {
                DeletePhrase()
            }
            return
        }
    } catch as err {
    }
}

; 핫키 동작 함수들
QuickAddSpeaker(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    if (speakers.Length >= 9) {
        ShowModernTooltip("화자는 최대 9명까지만 등록 가능합니다.", 2000)
        return
    }
    
    ClipSaved := ClipboardAll()
    A_Clipboard := ""
    
    Send("{Shift Down}{Home}{Shift Up}")
    Sleep(50)
    Send("^c")
    ClipWait(0.5)
    
    if (A_Clipboard = "") {
        A_Clipboard := ClipSaved
        Send("{Right}")
        return
    }
    
    textBeforeCursor := A_Clipboard
    Send("{Right}")
    Sleep(30)
    
    speakerName := Trim(textBeforeCursor)
    
    if (speakerName = "") {
        A_Clipboard := ClipSaved
        return
    }
    
    words := StrSplit(speakerName, " ")
    wordCount := 0
    for word in words {
        if (Trim(word) != "") {
            wordCount := wordCount + 1
        }
    }
    
    if (wordCount > 3) {
        ShowModernTooltip("화자명은 최대 3단어까지만 가능합니다.", 2000)
        A_Clipboard := ClipSaved
        return
    }
    
    newSpeaker := {
        name: speakerName,
        number: speakers.Length + 1
    }
    
    speakers.Push(newSpeaker)
    
    if (IsObject(mainGui) && IsObject(speakerListView)) {
        UpdateSpeakerList()
    }
    
    SaveSettings()
    
    circleNumbers := ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]
    msg := circleNumbers[newSpeaker.number] . " " . speakerName . " 등록"
    msg .= " (Insert+" . newSpeaker.number . ")"
    
    ShowModernTooltip(msg, 1500)
    
    Loop StrLen(textBeforeCursor) {
        Send("{BS}")
    }
    
    Sleep(100)
    A_Clipboard := ClipSaved
    
    global insert_pressed_time := 0
}

DeleteWordBackward(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        Send("{" . deleteWordKey . "}")
        return
    }
    
    if (isF4Processing) {
        return
    }
    
    global insert_pressed_time := 0
    
    global isF4Processing := true
    
    if (GetKeyState("Ctrl", "P") || GetKeyState("Alt", "P") || GetKeyState("Shift", "P")) {
        Send("{" . deleteWordKey . "}")
        global isF4Processing := false
        return
    }
    
    KeyWait(deleteWordKey)
    
    Send("{Esc}")
    Sleep(20)
    Send("^{BS}")
    
    if (chkShowTooltips.Value) {
        ShowModernTooltip("단어 삭제", 800)
    }
    
    global isF4Processing := false
}

QuickAddSpeakerFromInput(*) {
    if (speakers.Length >= 9) {
        ShowModernTooltip("화자는 최대 9명까지만 추가할 수 있습니다.", 2000)
        return
    }
    
    speakerName := Trim(speakerQuickInput.Text)
    if (speakerName = "") {
        return
    }
    
    newSpeaker := {
        name: speakerName,
        number: speakers.Length + 1
    }
    
    speakers.Push(newSpeaker)
    UpdateSpeakerList()
    SaveSettings()
    
    speakerQuickInput.Text := ""
    
    circleNumbers := ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]
    ShowModernTooltip(circleNumbers[newSpeaker.number] . " " . speakerName . " 추가 완료", 1000)
    
    speakerQuickInput.Focus()
}

InsertSpeaker(num, *) {
    if (num > speakers.Length) {
        ShowModernTooltip("화자" . num . " 없음!", 1000)
        return
    }
    
    speakerName := speakers[num].name
    
    insertText := speakerPrefix . speakerName . speakerSuffix
    if (speakerAutoNewline) {
        insertText := "`n" . insertText
    }
    
    SendText(insertText)
    
    ShowModernTooltip("화자 삽입: " . speakerName, 1000)
}

TriggerPhrase(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    Sleep(20)
    
    ClipSaved := ClipboardAll()
    A_Clipboard := ""
    
    Send("^+{Left}")
    Sleep(20)
    Send("^c")
    
    if (!ClipWait(0.2)) {
        A_Clipboard := ClipSaved
        Send("{Right}")
        return
    }
    
    selectedWord := Trim(A_Clipboard)
    
    if (phrases.Has(selectedWord)) {
        Send("{Del}")
        Sleep(10)
        SendText(phrases[selectedWord].content)
        
        phrases[selectedWord].count := phrases[selectedWord].count + 1
        
        if (IsObject(mainGui) && mainGui.Hwnd) {
            try {
                UpdatePhraseList()
            }
        }
        
        if (chkShowTooltips.Value) {
            ShowModernTooltip("→ " . phrases[selectedWord].content, 800)
        }
    } else {
        Send("{Right}")
    }
    
    Sleep(30)
    A_Clipboard := ClipSaved
    
    global insert_pressed_time := 0
}

RegisterPhraseFromEditor(*) {
    if (WinActive("ahk_id " . mainGui.Hwnd)) {
        return
    }
    
    ClipSaved := ClipboardAll()
    A_Clipboard := ""
    
    Send("{Home}+{End}^c")
    ClipWait(0.2)
    
    if (A_Clipboard = "") {
        A_Clipboard := ClipSaved
        return
    }
    
    text := Trim(A_Clipboard)
    
    lastColonPos := InStr(text, ":", , -1)
    if (lastColonPos = 0) {
        ShowModernTooltip("상용구 형식 오류 (예: 가:가나다)", 1500)
        A_Clipboard := ClipSaved
        return
    }
    
    beforeColon := SubStr(text, 1, lastColonPos - 1)
    afterColon := SubStr(text, lastColonPos + 1)
    
    beforeColon := Trim(beforeColon)
    lastSpacePos := InStr(beforeColon, " ", , -1)
    if (lastSpacePos > 0) {
        key := SubStr(beforeColon, lastSpacePos + 1)
    } else {
        key := beforeColon
    }
    key := Trim(key)
    
    if (key = "") {
        ShowModernTooltip("키를 입력해주세요", 1500)
        A_Clipboard := ClipSaved
        return
    }
    
    content := Trim(afterColon)
    
    if (key = "" || content = "") {
        ShowModernTooltip("키와 내용을 모두 입력해주세요", 1500)
        A_Clipboard := ClipSaved
        return
    }
    
    phrases[key] := {content: content, count: 0}
    
    Send("{End}")
    deleteLength := StrLen(key) + 1 + StrLen(content)
    Loop deleteLength {
        Send("{BS}")
    }
    
    UpdatePhraseList()
    SaveSettings()
    
    ShowModernTooltip("'" . key . "' 등록 완료!", 1500)
    
    Sleep(30)
    A_Clipboard := ClipSaved
    
    global insert_pressed_time := 0
}

; ############################################
; #       유틸리티 함수                     #
; ############################################
ShowModernTooltip(text, duration := 1000) {
    if (!WinActive("ahk_id " . mainGui.Hwnd)) {
        ToolTip(text)
        SetTimer(() => ToolTip(), -duration)
        return
    }
    
    ToolTip(text)
    SetTimer(() => ToolTip(), -duration)
    
    if (IsObject(statusText)) {
        statusText.Text := text
        SetTimer(() => UpdateStatusBar(), -duration)
    }
}

UpdateStatusBar(text := "Ready") {
    if (IsObject(statusText)) {
        statusText.Text := text
    }
    
    if (IsObject(speakerCountText)) {
        speakerCountText.Text := "화자: " . speakers.Length . "/9"
    }
    
    if (IsObject(phraseCountText)) {
        phraseCountText.Text := "상용구: " . phrases.Count . "개"
    }
}

; ############################################
; #       설정 저장/로드                     #
; ############################################
SaveSettings(*) {
    try {
        UpdateStatusBar("저장 중...")
        
        ; 화자 저장
        IniWrite(speakers.Length, settingsFile, "Speakers", "Count")
        Loop speakers.Length {
            IniWrite(speakers[A_Index].name, settingsFile, "Speakers", "Speaker" . A_Index)
        }
        
        ; 화자 형식 저장
        IniWrite(speakerPrefix, settingsFile, "SpeakerFormat", "Prefix")
        IniWrite(speakerSuffix, settingsFile, "SpeakerFormat", "Suffix")
        IniWrite(speakerAutoNewline, settingsFile, "SpeakerFormat", "AutoNewline")
        
        ; 상용구 저장
        phraseKeys := ""
        for key, data in phrases {
            phraseKeys .= key . "|"
            IniWrite(data.content, settingsFile, "Phrases", key)
            IniWrite(data.count, settingsFile, "PhraseCount", key)
        }
        IniWrite(phraseKeys, settingsFile, "Phrases", "Keys")
        
        ; 단축키 저장
        IniWrite(triggerKey, settingsFile, "Hotkeys", "TriggerKey")
        IniWrite(registerKey, settingsFile, "Hotkeys", "RegisterKey")
        IniWrite(deleteWordKey, settingsFile, "Hotkeys", "DeleteWordKey")
        
        ; 설정 저장
        if (IsObject(chkAutoStart)) {
            IniWrite(chkAutoStart.Value, settingsFile, "Settings", "AutoStart")
        }
        if (IsObject(chkMinimizeToTray)) {
            IniWrite(chkMinimizeToTray.Value, settingsFile, "Settings", "MinimizeToTray")
        }
        if (IsObject(chkShowTooltips)) {
            IniWrite(chkShowTooltips.Value, settingsFile, "Settings", "ShowTooltips")
        }
        IniWrite(comboThreshold, settingsFile, "Settings", "ComboThreshold")
        
        ; 사용자 지정 글자수 저장
        if (IsObject(customCharInput) && customCharInput.Text != "") {
            IniWrite(customCharInput.Text, settingsFile, "Script", "CustomCharCount")
        }
        
        ; 구두점 추가 분할 옵션 저장
        if (IsObject(chkPunctuation)) {
            IniWrite(chkPunctuation.Value, settingsFile, "Script", "PunctuationSplit")
        }
        
        ; 대본 자동 줄바꿈 옵션 저장
        if (IsObject(chkScriptAutoNewline)) {
            IniWrite(chkScriptAutoNewline.Value, settingsFile, "Script", "ScriptAutoNewline")
        }
        
        ; 타임스탬프 자동 줄바꿈 저장
        IniWrite(timestampAutoNewline, settingsFile, "Timestamp", "AutoNewline")
        
        ; Enter 시 자동 타임스탬프 저장
        IniWrite(enterAutoTimestamp, settingsFile, "Timestamp", "EnterAutoTimestamp")
        
        ShowModernTooltip("설정이 저장되었습니다.", 1500)
        
    } catch as err {
        UpdateStatusBar("저장 실패")
        MsgBox("설정 저장 중 오류가 발생했습니다.`n`n" . err.Message, "오류", "Icon!")
    }
}

LoadSettings() {
    try {
        ; 화자 로드
        speakerCount := Integer(IniRead(settingsFile, "Speakers", "Count", 0))
        Loop speakerCount {
            name := IniRead(settingsFile, "Speakers", "Speaker" . A_Index, "화자" . A_Index)
            speakers.Push({name: name, number: A_Index})
        }
        
        ; 화자 형식 로드
        global speakerPrefix := IniRead(settingsFile, "SpeakerFormat", "Prefix", "-")
        global speakerSuffix := IniRead(settingsFile, "SpeakerFormat", "Suffix", ": ")
        global speakerAutoNewline := Integer(IniRead(settingsFile, "SpeakerFormat", "AutoNewline", 1))
        
        ; 상용구 로드
        phraseKeys := IniRead(settingsFile, "Phrases", "Keys", "")
        if (phraseKeys != "") {
            keys := StrSplit(phraseKeys, "|")
            for key in keys {
                if (key != "") {
                    content := IniRead(settingsFile, "Phrases", key, "")
                    count := Integer(IniRead(settingsFile, "PhraseCount", key, 0))
                    if (content != "") {
                        phrases[key] := {content: content, count: count}
                    }
                }
            }
        }
        
        ; 단축키 로드
        global triggerKey := IniRead(settingsFile, "Hotkeys", "TriggerKey", "F3")
        global registerKey := IniRead(settingsFile, "Hotkeys", "RegisterKey", "F10")
        global deleteWordKey := IniRead(settingsFile, "Hotkeys", "DeleteWordKey", "F4")
        
        ; 타이밍 설정 로드
        global comboThreshold := Integer(IniRead(settingsFile, "Settings", "ComboThreshold", 3000))
        
        ; 대본 자동 줄바꿈 로드
        global scriptAutoNewline := Integer(IniRead(settingsFile, "Script", "ScriptAutoNewline", 1))
        
        ; 타임스탬프 자동 줄바꿈 로드
        global timestampAutoNewline := Integer(IniRead(settingsFile, "Timestamp", "AutoNewline", 0))
        
        ; Enter 시 자동 타임스탬프 로드
        global enterAutoTimestamp := Integer(IniRead(settingsFile, "Timestamp", "EnterAutoTimestamp", 0))
        
        ; GUI가 생성된 후에 체크박스 값 로드
        SetTimer(() => LoadCheckboxValues(), -100)
        
    } catch as err {
    }
}

LoadCheckboxValues() {
    try {
        if (IsObject(chkAutoStart)) {
            chkAutoStart.Value := Integer(IniRead(settingsFile, "Settings", "AutoStart", 0))
        }
        if (IsObject(chkMinimizeToTray)) {
            chkMinimizeToTray.Value := Integer(IniRead(settingsFile, "Settings", "MinimizeToTray", 0))
        }
        if (IsObject(chkShowTooltips)) {
            chkShowTooltips.Value := Integer(IniRead(settingsFile, "Settings", "ShowTooltips", 1))
        }
        if (IsObject(customCharInput)) {
            customCharInput.Text := IniRead(settingsFile, "Script", "CustomCharCount", "")
        }
        if (IsObject(chkPunctuation)) {
            chkPunctuation.Value := Integer(IniRead(settingsFile, "Script", "PunctuationSplit", 0))
        }
        if (IsObject(chkScriptAutoNewline)) {
            chkScriptAutoNewline.Value := Integer(IniRead(settingsFile, "Script", "ScriptAutoNewline", 1))
        }
        if (IsObject(chkTimestampNewline)) {
            chkTimestampNewline.Value := timestampAutoNewline
        }
        if (IsObject(chkEnterTimestamp)) {
            chkEnterTimestamp.Value := enterAutoTimestamp
        }
    } catch as err {
    }
}

CreateBackup(*) {
    backupFile := A_ScriptDir . "\StenoHelper_Backup_" . FormatTime(A_Now, "yyyyMMdd_HHmmss") . ".ini"
    
    try {
        FileCopy(settingsFile, backupFile)
        MsgBox("백업이 생성되었습니다.`n`n" . backupFile, "성공", "Icon!")
    } catch as err {
        MsgBox("백업 생성 중 오류가 발생했습니다.", "오류", "Icon!")
    }
}

RestoreBackup(*) {
    selectedFile := FileSelect(1, A_ScriptDir, "백업 파일 선택", "백업 파일 (*.ini)")
    if (!selectedFile) {
        return
    }
    
    result := MsgBox("현재 설정을 백업 파일로 덮어쓰시겠습니까?`n`n기존 설정은 모두 삭제됩니다.", "경고", "YesNo Icon!")
    if (result = "No") {
        return
    }
    
    try {
        FileCopy(selectedFile, settingsFile, true)
        
        global speakers := []
        global phrases := Map()
        LoadSettings()
        UpdateSpeakerList()
        UpdatePhraseList()
        
        MsgBox("백업이 복원되었습니다.", "성공", "Icon!")
        
    } catch as err {
        MsgBox("백업 복원 중 오류가 발생했습니다.", "오류", "Icon!")
    }
}

ResetSettings(*) {
    result := MsgBox("모든 설정을 초기화하시겠습니까?`n`n저장된 화자와 상용구가 모두 삭제됩니다.", "경고", "YesNo Icon!")
    if (result = "No") {
        return
    }
    
    global speakers := []
    global phrases := Map()
    global triggerKey := "F3"
    global registerKey := "F10"
    global deleteWordKey := "F4"
    
    try {
        FileDelete(settingsFile)
    } catch {
    }
    
    UpdateSpeakerList()
    UpdatePhraseList()
    triggerKeyText.Text := triggerKey
    registerKeyText.Text := registerKey
    deleteWordKeyText.Text := deleteWordKey
    
    SetupHotkeys()
    
    MsgBox("설정이 초기화되었습니다.", "완료", "Icon!")
}

ToggleAutoStart(*) {
    if (chkAutoStart.Value) {
        RegWrite(A_ScriptFullPath, "REG_SZ", "HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "StenoHelper")
    } else {
        try {
            RegDelete("HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "StenoHelper")
        } catch {
        }
    }
}

CloseOrMinimize() {
    if (IsObject(scriptPopupGui) && scriptPopupGui.Hwnd) {
        scriptPopupGui.Destroy()
    }
    if (IsObject(speakerPopupGui) && speakerPopupGui.Hwnd) {
        speakerPopupGui.Destroy()
    }
    if (IsObject(phrasePopupGui) && phrasePopupGui.Hwnd) {
        phrasePopupGui.Destroy()
    }
    if (IsObject(timerPopupGui) && timerPopupGui.Hwnd) {
        timerPopupGui.Destroy()
    }
    if (IsObject(subtitlePopupGui) && subtitlePopupGui.Hwnd) {
        subtitlePopupGui.Destroy()
    }
    
    if (IsObject(chkMinimizeToTray) && chkMinimizeToTray.Value) {
        mainGui.Hide()
        TrayTip("HanKey", "트레이로 최소화되었습니다.`n더블클릭으로 다시 열 수 있습니다.", 1)
    } else {
        ExitApp()
    }
}

; ############################################
; #       트레이 아이콘 설정                 #
; ############################################
TraySetIcon("Shell32.dll", 264)
A_IconTip := "HanKey"

A_TrayMenu.Delete()
A_TrayMenu.Add("열기", (*) => mainGui.Show())
A_TrayMenu.Add()
A_TrayMenu.Add("화자 관리", (*) => ShowTab(1))
A_TrayMenu.Add("상용구 관리", (*) => ShowTab(2))
A_TrayMenu.Add("대본 송출", (*) => ShowTab(3))
A_TrayMenu.Add("자막 도구", (*) => ShowTab(5))
A_TrayMenu.Add()
A_TrayMenu.Add("종료", (*) => ExitApp())
A_TrayMenu.Default := "열기"

ShowTab(tabNum) {
    mainGui.Show()
    if (IsObject(tabControl)) {
        tabControl.Choose(tabNum)
    }
}

OnMessage(0x203, OnTrayDoubleClick)

OnTrayDoubleClick(*) {
    mainGui.Show()
}

A_IconHidden := false

if (A_Args.Length > 0 && A_Args[1] = "/minimize") {
    mainGui.Hide()
}
