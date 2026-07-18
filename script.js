/**
 * Numer0n - サイバー・ディメンション ゲームロジック (アイテム対応版)
 * 
 * すべてのコメントは日本語で記述されています。
 * 変数名、関数名などは英語を維持しています。
 */

// ==========================================================================
// 1. サウンドエフェクトマネージャー (Web Audio API)
// ==========================================================================
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    initContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    playOscillator(freqs, type, duration, sweep = false, sweepEndFreq = 0) {
        if (this.muted) return;
        this.initContext();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        freqs.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);

            if (sweep && sweepEndFreq > 0) {
                osc.frequency.exponentialRampToValueAtTime(sweepEndFreq, now + duration);
            }

            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);

            osc.start(now + idx * 0.08);
            osc.stop(now + duration + idx * 0.08);
        });
    }

    playClick() {
        this.playOscillator([880], 'sine', 0.08);
    }

    playClear() {
        this.playOscillator([600], 'sine', 0.15, true, 300);
    }

    playAttack() {
        this.playOscillator([400], 'sawtooth', 0.4, true, 1200);
    }

    playEat() {
        this.playOscillator([523.25, 659.25, 783.99], 'sine', 0.25);
    }

    playBite() {
        this.playOscillator([587.33, 698.46], 'triangle', 0.2);
    }

    playWin() {
        this.playOscillator([523.25, 659.25, 783.99, 1046.5], 'sine', 0.6);
    }

    playLose() {
        this.playOscillator([220, 207.65, 196], 'sawtooth', 0.8, true, 100);
    }

    // アイテム発動時の警告音
    playItem() {
        this.playOscillator([660, 660], 'square', 0.3);
    }

    // シャッフル・チェンジ音
    playShuffle() {
        this.playOscillator([300, 400, 500, 600, 700], 'sine', 0.4);
    }
}

const sounds = new SoundManager();

// ==========================================================================
// 2. CPU推論AIクラス (アイテム対応拡張)
// ==========================================================================
class CpuPlayer {
    constructor() {
        this.secret = '';
        this.candidates = [];
        
        // アイテム所持状態
        this.atkItem = ''; // 'double' | 'high-low' | 'target' | 'slash'
        this.defItem = ''; // 'shuffle' | 'change'
        this.atkUsed = false;
        this.defUsed = false;

        // CPUが得たプレイヤー情報のメモ (推論の再構成用)
        this.knownHL = [null, null, null]; // 各桁の 'H' or 'L'
        this.knownSlash = null;            // スラッシュナンバー
        this.knownTargets = [];            // [{digit: '3', found: true, position: 1}]
        this.attackHistory = [];           // [{guess: '123', eat: 1, bite: 1}]

        this.reset();
    }

    reset() {
        this.secret = this.generateRandomSecret();
        this.candidates = this.generateAllCombinations();
        this.atkUsed = false;
        this.defUsed = false;
        this.knownHL = [null, null, null];
        this.knownSlash = null;
        this.knownTargets = [];
        this.attackHistory = [];
    }

    generateAllCombinations() {
        const list = [];
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                if (i === j) continue;
                for (let k = 0; k < 10; k++) {
                    if (i === k || j === k) continue;
                    list.push(`${i}${j}${k}`);
                }
            }
        }
        return list;
    }

    generateRandomSecret() {
        const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        let result = '';
        for (let i = 0; i < 3; i++) {
            const idx = Math.floor(Math.random() * digits.length);
            result += digits.splice(idx, 1)[0];
        }
        return result;
    }

    // 通常の推測コール
    makeGuess() {
        if (this.candidates.length === 0) {
            return this.generateRandomSecret();
        }
        const idx = Math.floor(Math.random() * this.candidates.length);
        return this.candidates[idx];
    }

    // コール結果のフィードバック (履歴に保存してフィルタリング)
    feedback(guess, eat, bite) {
        this.attackHistory.push({ guess, eat, bite });
        const initialSize = this.candidates.length;
        
        this.candidates = this.candidates.filter(cand => {
            const res = GameLogic.calculateEatBite(cand, guess);
            return res.eat === eat && res.bite === bite;
        });

        console.log(`[CPU AI] コールフィルタリング: ${initialSize} -> ${this.candidates.length}`);
    }

    // -------------------------------------------------------------
    // アイテム効果の適用 (候補フィルタリング)
    // -------------------------------------------------------------

    // HIGH & LOW 情報の適用
    applyHighLow(hlPattern) {
        this.knownHL = hlPattern;
        const initialSize = this.candidates.length;
        
        this.candidates = this.candidates.filter(cand => {
            for (let i = 0; i < 3; i++) {
                const val = parseInt(cand[i]);
                const isHigh = hlPattern[i] === 'H';
                if (isHigh && val < 5) return false;
                if (!isHigh && val >= 5) return false;
            }
            return true;
        });
        console.log(`[CPU AI] HIGH&LOW フィルタリング: ${initialSize} -> ${this.candidates.length}`);
    }

    // TARGET 情報の適用
    applyTarget(digit, position) {
        this.knownTargets.push({ digit, found: position !== -1, position });
        const initialSize = this.candidates.length;

        this.candidates = this.candidates.filter(cand => {
            if (position !== -1) {
                return cand[position] === digit;
            } else {
                return !cand.includes(digit);
            }
        });
        console.log(`[CPU AI] TARGET フィルタリング: ${initialSize} -> ${this.candidates.length}`);
    }

    // SLASH 情報の適用
    applySlash(slashNumber) {
        this.knownSlash = slashNumber;
        const initialSize = this.candidates.length;

        this.candidates = this.candidates.filter(cand => {
            const nums = cand.split('').map(Number);
            const diff = Math.max(...nums) - Math.min(...nums);
            return diff === slashNumber;
        });
        console.log(`[CPU AI] SLASH フィルタリング: ${initialSize} -> ${this.candidates.length}`);
    }

    // DOUBLE での1桁開示情報の適用
    applyDoubleReveal(digit, position) {
        const initialSize = this.candidates.length;
        this.candidates = this.candidates.filter(cand => cand[position] === digit);
        
        // ターゲット情報としても記録しておく
        this.knownTargets.push({ digit, found: true, position });
        console.log(`[CPU AI] DOUBLE開示 フィルタリング: ${initialSize} -> ${this.candidates.length}`);
    }

    // プレイヤーがシャッフルした際の再構築
    applyShuffle() {
        const initialSize = this.candidates.length;
        let newCands = this.generateAllCombinations();

        // 1. 過去のコール履歴を「共通数字の数 (EAT+BITE)」だけでフィルタリングし直す
        this.attackHistory.forEach(h => {
            const sum = h.eat + h.bite;
            newCands = newCands.filter(cand => {
                let common = 0;
                for (let i = 0; i < 3; i++) {
                    if (cand.includes(h.guess[i])) common++;
                }
                return common === sum;
            });
        });

        // 2. SLASH 情報の再適用 (位置不変)
        if (this.knownSlash !== null) {
            newCands = newCands.filter(cand => {
                const nums = cand.split('').map(Number);
                return (Math.max(...nums) - Math.min(...nums)) === this.knownSlash;
            });
        }

        // 3. TARGET 情報の再適用 (位置情報は崩れたが、含まれる・含まれないの属性は有効)
        this.knownTargets.forEach(t => {
            if (t.found) {
                newCands = newCands.filter(cand => cand.includes(t.digit));
            } else {
                newCands = newCands.filter(cand => !cand.includes(t.digit));
            }
        });

        // シャッフルされたため、過去の位置情報に依存する HIGH&LOW とターゲットの正確な位置は無効化
        this.knownHL = [null, null, null];
        this.knownTargets = this.knownTargets.map(t => ({ ...t, position: -1 }));

        this.candidates = newCands;
        console.log(`[CPU AI] プレイヤーのSHUFFLEに対応完了: ${initialSize} -> ${this.candidates.length}`);
    }

    // プレイヤーがチェンジした際の再構築
    applyChange(changedPos, isHigh, oldDigit) {
        const initialSize = this.candidates.length;
        
        // チェンジにより、過去のSLASH情報は無効化される (最大値・最小値が変わるため)
        this.knownSlash = null;

        // チェンジされた桁にあったターゲット情報も無効化
        this.knownTargets = this.knownTargets.filter(t => t.position !== changedPos);

        // チェンジされた桁の属性を更新
        this.knownHL[changedPos] = isHigh ? 'H' : 'L';

        // 過去のアタック履歴（EAT/BITE結果）は、チェンジによって整合性が失われるためすべて破棄する
        this.attackHistory = [];

        // 候補の再構成
        let newCands = this.generateAllCombinations();

        // 1. HIGH & LOW 情報の適用 (チェンジされた桁も含むすべての確定HL)
        newCands = newCands.filter(cand => {
            for (let i = 0; i < 3; i++) {
                if (!this.knownHL[i]) continue;
                const val = parseInt(cand[i]);
                const isH = this.knownHL[i] === 'H';
                if (isH && val < 5) return false;
                if (!isH && val >= 5) return false;
            }
            return true;
        });

        // 2. TARGET 情報の再適用
        this.knownTargets.forEach(t => {
            if (t.found) {
                if (t.position !== -1) {
                    newCands = newCands.filter(cand => cand[t.position] === t.digit);
                } else {
                    newCands = newCands.filter(cand => cand.includes(t.digit));
                }
            } else {
                newCands = newCands.filter(cand => !cand.includes(t.digit));
            }
        });

        // 3. チェンジ自体の制限（指定桁は oldDigit ではない）
        newCands = newCands.filter(cand => cand[changedPos] !== oldDigit);

        this.candidates = newCands;
        console.log(`[CPU AI] プレイヤーのCHANGEに対応完了: ${initialSize} -> ${this.candidates.length}`);
    }
}

// ==========================================================================
// 3. ゲームのユーティリティロジック
// ==========================================================================
const GameLogic = {
    calculateEatBite(secret, guess) {
        let eat = 0;
        let bite = 0;
        
        for (let i = 0; i < 3; i++) {
            if (guess[i] === secret[i]) {
                eat++;
            } else if (secret.includes(guess[i])) {
                bite++;
            }
        }
        
        return { eat, bite };
    },

    isValidNumber(numStr) {
        if (numStr.length !== 3) return false;
        if (!/^\d{3}$/.test(numStr)) return false;
        const set = new Set(numStr);
        return set.size === 3;
    }
};

// ==========================================================================
// 4. アプリケーションステート & UIマネージャー
// ==========================================================================
class Numer0nApp {
    constructor() {
        this.cpu = new CpuPlayer();
        
        // ゲームステート
        this.gameMode = 'single'; // 'single' | 'vs'
        this.playerSecret = '';
        this.playerSetupDigits = [];
        this.playerGuessDigits = [];
        
        this.playerTurns = 0;
        this.cpuTurns = 0;
        this.gameActive = false;
        
        // アイテムステート
        this.playerAtkItem = 'double';
        this.playerDefItem = 'shuffle';
        this.playerAtkUsed = false;
        this.playerDefUsed = false;
        
        // DOUBLE アタック制御用
        this.isDoubleMode = false;
        this.doubleStep = 0; // 1または2

        this.startTime = null;
        this.timerInterval = null;

        // 獲得情報の表示用データ (プレイヤー用インテルメモ)
        this.intelHL = [null, null, null];
        this.intelSlash = null;
        this.intelTargets = []; // [{digit, found, position}]

        // DOMの参照キャッシュ
        this.dom = {
            soundToggle: document.getElementById('sound-toggle'),
            ruleBtn: document.getElementById('rule-btn'),
            ruleModal: document.getElementById('rule-modal'),
            closeBtn: document.querySelector('.close-btn'),
            
            setupScreen: document.getElementById('setup-screen'),
            gameScreen: document.getElementById('game-screen'),
            resultScreen: document.getElementById('result-screen'),
            
            modeSingle: document.getElementById('mode-single'),
            modeVs: document.getElementById('mode-vs'),
            playerSecretContainer: document.getElementById('player-secret-container'),
            itemSetupContainer: document.getElementById('item-setup-container'),
            startGameBtn: document.getElementById('start-game-btn'),
            setupKeypad: document.getElementById('setup-keypad'),
            
            turnBadge: document.getElementById('turn-badge'),
            gameKeypad: document.getElementById('game-keypad'),
            gameAttackBtn: document.getElementById('game-attack'),
            playerStatusPanel: document.getElementById('player-status-panel'),
            playerSavedSecret: document.getElementById('player-saved-secret'),
            
            // アイテム関連
            playerItemSection: document.getElementById('player-item-section'),
            btnUseAtk: document.getElementById('btn-use-atk'),
            btnUseDef: document.getElementById('btn-use-def'),
            
            // インテルメモ
            intelPanel: document.getElementById('intel-panel'),
            intelHlReveal: document.getElementById('intel-hl-reveal'),
            intelSlashVal: document.getElementById('intel-slash-val'),
            intelTargetList: document.getElementById('intel-target-list'),
            
            // ログ
            cpuLogColumn: document.getElementById('cpu-log-column'),
            playerLogList: document.getElementById('player-log-list'),
            cpuLogList: document.getElementById('cpu-log-list'),
            
            // AI
            aiAnalysisPanel: document.getElementById('ai-analysis-panel'),
            aiCandidateCount: document.getElementById('ai-candidate-count'),
            aiPercentage: document.getElementById('ai-percentage'),
            aiProgressFill: document.getElementById('ai-progress-fill'),
            aiThoughtText: document.getElementById('ai-thought-text'),
            
            // アクションオーバーレイ
            actionOverlay: document.getElementById('action-overlay'),
            actionDialogTitle: document.getElementById('action-dialog-title'),
            actionDialogDesc: document.getElementById('action-dialog-desc'),
            actionDialogContent: document.getElementById('action-dialog-content'),
            actionDialogActions: document.getElementById('action-dialog-actions'),
            actionCancelBtn: document.getElementById('action-cancel-btn'),
            
            // 結果画面
            resultTitle: document.getElementById('result-title'),
            resultSubtitle: document.getElementById('result-subtitle'),
            cpuSecretReveal: document.getElementById('cpu-secret-reveal'),
            playerSecretRevealBox: document.getElementById('player-secret-reveal-box'),
            playerSecretReveal: document.getElementById('player-secret-reveal'),
            statTurns: document.getElementById('stat-turns'),
            statTime: document.getElementById('stat-time'),
            restartBtn: document.getElementById('restart-btn')
        };

        this.initEvents();
    }

    initEvents() {
        // 音声トグル
        this.dom.soundToggle.addEventListener('click', () => {
            const isMuted = sounds.toggleMute();
            const icon = this.dom.soundToggle.querySelector('i');
            if (isMuted) {
                icon.className = 'fas fa-volume-mute';
                this.dom.soundToggle.style.color = 'var(--color-accent)';
            } else {
                icon.className = 'fas fa-volume-up';
                this.dom.soundToggle.style.color = '';
                sounds.playClick();
            }
        });

        // モーダル
        this.dom.ruleBtn.addEventListener('click', () => {
            sounds.playClick();
            this.dom.ruleModal.classList.add('show');
        });
        
        const closeModal = () => {
            sounds.playClear();
            this.dom.ruleModal.classList.remove('show');
        };
        this.dom.closeBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => {
            if (e.target === this.dom.ruleModal) {
                closeModal();
            }
        });

        // モード選択
        this.dom.modeSingle.addEventListener('click', () => {
            sounds.playClick();
            this.setGameMode('single');
        });
        this.dom.modeVs.addEventListener('click', () => {
            sounds.playClick();
            this.setGameMode('vs');
        });

        // セットアップキーパッド
        this.dom.setupKeypad.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const val = btn.dataset.val;
            if (val !== undefined) {
                this.inputSetupDigit(val);
            } else if (btn.id === 'setup-clear') {
                this.clearSetupDigits();
            } else if (btn.id === 'setup-random') {
                this.randomizeSetupDigits();
            }
        });

        // ゲームキーパッド
        this.dom.gameKeypad.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const val = btn.dataset.val;
            if (val !== undefined) {
                this.inputGameDigit(val);
            } else if (btn.id === 'game-clear') {
                this.clearGameDigits();
            } else if (btn.id === 'game-attack') {
                this.executePlayerAttack();
            }
        });

        // アイテム使用ボタン
        this.dom.btnUseAtk.addEventListener('click', () => this.handlePlayerAtkItemUse());
        this.dom.btnUseDef.addEventListener('click', () => this.handlePlayerDefItemUse());

        // アクションダイアログのキャンセル
        this.dom.actionCancelBtn.addEventListener('click', () => {
            sounds.playClear();
            this.hideActionOverlay();
        });

        // スタート・リスタート
        this.dom.startGameBtn.addEventListener('click', () => this.startGame());
        this.dom.restartBtn.addEventListener('click', () => this.showSetupScreen());
    }

    setGameMode(mode) {
        this.gameMode = mode;
        if (mode === 'single') {
            this.dom.modeSingle.classList.add('active');
            this.dom.modeVs.classList.remove('active');
            this.dom.playerSecretContainer.style.display = 'none';
            this.dom.itemSetupContainer.style.display = 'none';
        } else {
            this.dom.modeSingle.classList.remove('active');
            this.dom.modeVs.classList.add('active');
            this.dom.playerSecretContainer.style.display = 'block';
            this.dom.itemSetupContainer.style.display = 'block';
            this.clearSetupDigits();
        }
    }

    // ==========================================================================
    // セットアップ入力
    // ==========================================================================
    inputSetupDigit(digit) {
        if (this.playerSetupDigits.length >= 3) return;
        if (this.playerSetupDigits.includes(digit)) {
            sounds.playOscillator([150], 'sawtooth', 0.15);
            return;
        }
        sounds.playClick();
        this.playerSetupDigits.push(digit);
        this.updateSetupDisplay();
    }

    clearSetupDigits() {
        sounds.playClear();
        this.playerSetupDigits = [];
        this.updateSetupDisplay();
    }

    randomizeSetupDigits() {
        sounds.playClick();
        const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        this.playerSetupDigits = [];
        for (let i = 0; i < 3; i++) {
            const idx = Math.floor(Math.random() * digits.length);
            this.playerSetupDigits.push(digits.splice(idx, 1)[0]);
        }
        this.updateSetupDisplay();
    }

    updateSetupDisplay() {
        for (let i = 0; i < 3; i++) {
            const slot = document.getElementById(`secret-slot-${i}`);
            const val = this.playerSetupDigits[i];
            if (val !== undefined) {
                slot.textContent = val;
                slot.classList.add('filled');
            } else {
                slot.textContent = '-';
                slot.classList.remove('filled');
            }
        }
        const buttons = this.dom.setupKeypad.querySelectorAll('.key-btn[data-val]');
        buttons.forEach(btn => {
            btn.disabled = this.playerSetupDigits.includes(btn.dataset.val);
        });
    }

    // ==========================================================================
    // ゲーム入力
    // ==========================================================================
    inputGameDigit(digit) {
        if (this.playerGuessDigits.length >= 3) return;
        if (this.playerGuessDigits.includes(digit)) {
            sounds.playOscillator([150], 'sawtooth', 0.15);
            return;
        }
        sounds.playClick();
        this.playerGuessDigits.push(digit);
        this.updateGameDisplay();
    }

    clearGameDigits() {
        sounds.playClear();
        this.playerGuessDigits = [];
        this.updateGameDisplay();
    }

    updateGameDisplay() {
        for (let i = 0; i < 3; i++) {
            const slot = document.getElementById(`guess-slot-${i}`);
            const val = this.playerGuessDigits[i];
            if (val !== undefined) {
                slot.textContent = val;
                slot.classList.add('filled');
            } else {
                slot.textContent = '-';
                slot.classList.remove('filled');
            }
        }
        const buttons = this.dom.gameKeypad.querySelectorAll('.key-btn[data-val]');
        buttons.forEach(btn => {
            btn.disabled = this.playerGuessDigits.includes(btn.dataset.val);
        });
        
        // DOUBLEモードの時は2連続コールの制御
        const label = this.isDoubleMode ? `CALL [${this.doubleStep}/2]` : 'CALL';
        this.dom.gameAttackBtn.textContent = label;
        this.dom.gameAttackBtn.disabled = this.playerGuessDigits.length !== 3;
    }

    // ==========================================================================
    // ゲーム開始
    // ==========================================================================
    startGame() {
        sounds.playClick();

        if (this.gameMode === 'vs') {
            const secretStr = this.playerSetupDigits.join('');
            if (!GameLogic.isValidNumber(secretStr)) {
                alert('秘密の数字を3桁入力してください。');
                return;
            }
            this.playerSecret = secretStr;
            this.dom.playerSavedSecret.textContent = secretStr;
            
            // 選択アイテムの取得
            const selectedAtk = document.querySelector('input[name="atk-item"]:checked').value;
            const selectedDef = document.querySelector('input[name="def-item"]:checked').value;
            this.playerAtkItem = selectedAtk;
            this.playerDefItem = selectedDef;
            this.playerAtkUsed = false;
            this.playerDefUsed = false;

            // CPUアイテムもランダム選択
            const atkItems = ['double', 'high-low', 'target', 'slash'];
            const defItems = ['shuffle', 'change'];
            this.cpu.atkItem = atkItems[Math.floor(Math.random() * atkItems.length)];
            this.cpu.defItem = defItems[Math.floor(Math.random() * defItems.length)];

            this.dom.playerStatusPanel.style.display = 'block';
            this.dom.cpuLogColumn.style.display = 'block';
            this.dom.aiAnalysisPanel.style.display = 'block';
            this.dom.playerItemSection.style.display = 'block';
            this.dom.intelPanel.style.display = 'block';

            // インテルメモの初期化
            this.intelHL = [null, null, null];
            this.intelSlash = null;
            this.intelTargets = [];
            this.updateIntelMemoDisplay();

            // アイテムボタンの初期表示
            this.updateItemButtonsDisplay();
            
            this.dom.gameScreen.querySelector('.game-layout').classList.add('vs-mode-layout');
        } else {
            this.playerSecret = '';
            this.dom.playerStatusPanel.style.display = 'none';
            this.dom.cpuLogColumn.style.display = 'none';
            this.dom.aiAnalysisPanel.style.display = 'none';
            this.dom.playerItemSection.style.display = 'none';
            this.dom.intelPanel.style.display = 'none';
            
            this.dom.gameScreen.querySelector('.game-layout').classList.remove('vs-mode-layout');
        }

        this.cpu.reset();
        this.playerTurns = 0;
        this.cpuTurns = 0;
        this.gameActive = true;
        this.isDoubleMode = false;
        this.doubleStep = 0;
        this.startTime = Date.now();

        this.dom.playerLogList.innerHTML = '';
        this.dom.cpuLogList.innerHTML = '';
        this.clearGameDigits();

        if (this.gameMode === 'vs') {
            this.updateAiAnalysisPanel(720, '「解析準備完了。アイテム運用シークエンスを開始します。」');
        }

        this.showScreen('game-screen');
        this.setTurn('player');
    }

    setTurn(turn) {
        this.turn = turn;
        if (turn === 'player') {
            this.dom.turnBadge.textContent = 'YOUR TURN';
            this.dom.turnBadge.className = 'turn-indicator active';
            this.setKeypadDisabled(false);
            this.updateItemButtonsDisplay();
        } else {
            this.dom.turnBadge.textContent = 'CPU TURN';
            this.dom.turnBadge.className = 'turn-indicator cpu-active';
            this.setKeypadDisabled(true);
            this.updateItemButtonsDisplay();
            
            setTimeout(() => this.executeCpuTurn(), 1500);
        }
    }

    setKeypadDisabled(disabled) {
        const buttons = this.dom.gameKeypad.querySelectorAll('.key-btn');
        buttons.forEach(btn => {
            if (btn.id === 'game-attack') {
                btn.disabled = disabled || this.playerGuessDigits.length !== 3;
            } else {
                btn.disabled = disabled || (btn.dataset.val && this.playerGuessDigits.includes(btn.dataset.val));
            }
        });
    }

    updateItemButtonsDisplay() {
        if (this.gameMode !== 'vs') return;

        // 攻撃アイテム
        this.dom.btnUseAtk.querySelector('.item-name').textContent = this.playerAtkItem.toUpperCase();
        this.dom.btnUseAtk.disabled = this.playerAtkUsed || this.turn !== 'player' || this.isDoubleMode;
        if (this.playerAtkUsed) {
            this.dom.btnUseAtk.classList.add('used');
        } else {
            this.dom.btnUseAtk.classList.remove('used');
        }

        // 防御アイテム
        this.dom.btnUseDef.querySelector('.item-name').textContent = this.playerDefItem.toUpperCase();
        this.dom.btnUseDef.disabled = this.playerDefUsed || this.turn !== 'player' || this.isDoubleMode;
        if (this.playerDefUsed) {
            this.dom.btnUseDef.classList.add('used');
        } else {
            this.dom.btnUseDef.classList.remove('used');
        }
    }

    // ==========================================================================
    // プレイヤーのアイテム使用ハンドラー
    // ==========================================================================
    
    // 攻撃系アイテム
    handlePlayerAtkItemUse() {
        if (this.playerAtkUsed || this.turn !== 'player') return;
        sounds.playItem();

        switch (this.playerAtkItem) {
            case 'double':
                // DOUBLE: 相手に開示桁を指定させる
                this.playerAtkUsed = true;
                this.updateItemButtonsDisplay();
                this.executeCpuDoubleCounter();
                break;
            case 'high-low':
                // HIGH-LOW: 即座に開示
                this.playerAtkUsed = true;
                this.updateItemButtonsDisplay();
                this.executePlayerHighLow();
                break;
            case 'target':
                // TARGET: ターゲット数字選択UIを出す
                this.showTargetSelectionDialog();
                break;
            case 'slash':
                // SLASH: 即座に開示
                this.playerAtkUsed = true;
                this.updateItemButtonsDisplay();
                this.executePlayerSlash();
                break;
        }
    }

    // 防御系アイテム
    handlePlayerDefItemUse() {
        if (this.playerDefUsed || this.turn !== 'player') return;
        sounds.playItem();

        switch (this.playerDefItem) {
            case 'shuffle':
                this.playerDefUsed = true;
                this.updateItemButtonsDisplay();
                this.executePlayerShuffle();
                break;
            case 'change':
                this.showChangeSelectionDialog();
                break;
        }
    }

    // -------------------------------------------------------------
    // 各アイテムの実装 (プレイヤー側)
    // -------------------------------------------------------------
    
    // DOUBLE 発動 (CPUが開示桁を指定)
    executeCpuDoubleCounter() {
        // CPUはまだ開示されていない桁をランダムに選んで指定する
        const availablePos = [0, 1, 2];
        const chosenPos = availablePos[Math.floor(Math.random() * availablePos.length)];
        const digit = this.playerSecret[chosenPos];

        // CPUに情報が伝わる
        this.cpu.applyDoubleReveal(digit, chosenPos);

        // UI表示
        this.addSystemLog('player', 'DOUBLE', `DOUBLE発動。代償としてCPUに [${chosenPos+1}桁目: ${digit}] が開示されました。`);
        this.addSystemLog('cpu', 'DOUBLE COUNTER', `プレイヤーの [${chosenPos+1}桁目: ${digit}] を捕捉。`);

        // ダブルコールモード開始
        this.isDoubleMode = true;
        this.doubleStep = 1;
        this.updateGameDisplay();
    }

    // HIGH & LOW 発動
    executePlayerHighLow() {
        const secret = this.cpu.secret;
        const hl = [];
        for (let i = 0; i < 3; i++) {
            hl.push(parseInt(secret[i]) >= 5 ? 'HIGH' : 'LOW');
        }

        // インテルメモに反映
        this.intelHL = hl.map(val => val === 'HIGH' ? 'H' : 'L');
        this.updateIntelMemoDisplay();

        this.addSystemLog('player', 'HIGH & LOW', `CPUの桁属性を解析完了: [${hl.join(', ')}]`);
    }

    // TARGET 用ダイアログ表示
    showTargetSelectionDialog() {
        this.showActionOverlay('TARGETの指定', '相手のコードに含まれているか確認したい数字（0〜9）を選択してください。', false);
        
        const grid = document.createElement('div');
        grid.className = 'selection-grid';
        
        for (let i = 0; i < 10; i++) {
            const btn = document.createElement('button');
            btn.className = 'selection-btn';
            btn.textContent = i;
            btn.addEventListener('click', () => {
                sounds.playClick();
                this.playerAtkUsed = true;
                this.updateItemButtonsDisplay();
                this.hideActionOverlay();
                this.executePlayerTarget(i.toString());
            });
            grid.appendChild(btn);
        }
        this.dom.actionDialogContent.appendChild(grid);
    }

    // TARGET 判定実行
    executePlayerTarget(digit) {
        const secret = this.cpu.secret;
        const index = secret.indexOf(digit); // 0, 1, 2 or -1
        
        let desc = '';
        if (index !== -1) {
            desc = `数字 [${digit}] は相手のコードの [${index+1}桁目] に含まれています。`;
            this.intelTargets.push({ digit, found: true, position: index });
        } else {
            desc = `数字 [${digit}] は相手のコードに含まれていません。`;
            this.intelTargets.push({ digit, found: false, position: -1 });
        }

        this.updateIntelMemoDisplay();
        this.addSystemLog('player', 'TARGET', `TARGET [${digit}] 実行結果: ${desc}`);
    }

    // SLASH 発動
    executePlayerSlash() {
        const secret = this.cpu.secret;
        const nums = secret.split('').map(Number);
        const slash = Math.max(...nums) - Math.min(...nums);

        this.intelSlash = slash;
        this.updateIntelMemoDisplay();

        this.addSystemLog('player', 'SLASH', `CPUのコードのSLASHナンバーは [${slash}] です。 (最大値 - 最小値)`);
    }

    // SHUFFLE 防御発動
    executePlayerShuffle() {
        sounds.playShuffle();
        
        // プレイヤーの秘密数字をシャッフル
        const arr = this.playerSecret.split('');
        // Fisher-Yates シャッフル
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        const newSecret = arr.join('');
        this.playerSecret = newSecret;
        this.dom.playerSavedSecret.textContent = newSecret;

        // CPU AIにシャッフル対応を行わせる
        this.cpu.applyShuffle();

        this.addSystemLog('player', 'SHUFFLE', `秘密の数字を入れ替えました。新しい数字: [${newSecret}]`);
        this.addSystemLog('cpu', 'SHUFFLE DETECTED', `プレイヤーがシャッフルを実行。位置情報の再補正を行います。`);
        this.updateAiAnalysisPanel(this.cpu.candidates.length, `「目標がシャッフルされました。共通数字情報を抽出して候補を再計算します。」`);
    }

    // CHANGE 用ダイアログ表示
    showChangeSelectionDialog() {
        this.showActionOverlay('CHANGEする桁の選択', 'チェンジする桁を選択してください。その桁がHIGHなら別のHIGHに、LOWなら別のLOWに置き換わります。', false);

        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '15px';

        const row = document.createElement('div');
        row.className = 'item-buttons-container';

        for (let i = 0; i < 3; i++) {
            const digit = this.playerSecret[i];
            const isHigh = parseInt(digit) >= 5;
            const hlLabel = isHigh ? 'HIGH' : 'LOW';

            const btn = document.createElement('button');
            btn.className = 'btn-item';
            btn.innerHTML = `
                <span class="item-name">${i+1}桁目 (${digit})</span>
                <span class="item-type-label">${hlLabel}</span>
            `;
            btn.addEventListener('click', () => {
                sounds.playClick();
                this.playerDefUsed = true;
                this.updateItemButtonsDisplay();
                this.hideActionOverlay();
                this.executePlayerChange(i, isHigh, digit);
            });
            row.appendChild(btn);
        }
        container.appendChild(row);
        this.dom.actionDialogContent.appendChild(container);
    }

    // CHANGE 実行
    executePlayerChange(pos, isHigh, oldDigit) {
        sounds.playShuffle();

        // 変更先の候補を探す (HIGHは5-9、LOWは0-4、ただし現在の3桁に含まれないもの)
        const allDigits = isHigh ? ['5', '6', '7', '8', '9'] : ['0', '1', '2', '3', '4'];
        const currentSecret = this.playerSecret;
        const available = allDigits.filter(d => !currentSecret.includes(d));

        if (available.length === 0) {
            // 理論上あり得ない（HIGHは5枚中最大3枚、LOWも5枚中最大3枚のため、必ず2枚は余る）
            alert('チェンジ可能な数字がありません。');
            return;
        }

        const newDigit = available[Math.floor(Math.random() * available.length)];
        const arr = this.playerSecret.split('');
        arr[pos] = newDigit;
        const newSecret = arr.join('');
        this.playerSecret = newSecret;
        this.dom.playerSavedSecret.textContent = newSecret;

        // CPU AIにチェンジの事実を伝える
        this.cpu.applyChange(pos, isHigh, oldDigit);

        this.addSystemLog('player', 'CHANGE', `[${pos+1}桁目] の [${oldDigit}] を [${newDigit}] に変更しました。新しい数字: [${newSecret}]`);
        this.addSystemLog('cpu', 'CHANGE DETECTED', `プレイヤーが [${pos+1}桁目] をチェンジ (${isHigh ? 'HIGH' : 'LOW'})。再解析中。`);
        this.updateAiAnalysisPanel(this.cpu.candidates.length, `「目標が [${pos+1}桁目] をCHANGE。候補を [${this.cpu.candidates.length}通り] に再構築しました。」`);
    }

    // ==========================================================================
    // プレイヤーの通常アタック実行 (DOUBLEの連続ターンに対応)
    // ==========================================================================
    executePlayerAttack() {
        if (!this.gameActive || this.turn !== 'player') return;
        
        const guessStr = this.playerGuessDigits.join('');
        if (!GameLogic.isValidNumber(guessStr)) return;

        this.playerTurns++;
        sounds.playAttack();

        // 判定
        const result = GameLogic.calculateEatBite(this.cpu.secret, guessStr);
        
        // ログ追加
        this.addLogItem('player', this.playerTurns, guessStr, result);
        this.clearGameDigits();

        setTimeout(() => {
            if (result.eat === 3) {
                this.endGame('victory');
                return;
            }

            // 効果音
            if (result.eat > 0) {
                sounds.playEat();
            } else if (result.bite > 0) {
                sounds.playBite();
            } else {
                sounds.playOscillator([300], 'sine', 0.15);
            }

            // DOUBLE モードの連続アタック制御
            if (this.isDoubleMode) {
                if (this.doubleStep === 1) {
                    // 1回目終了 -> 2回目を促す
                    this.doubleStep = 2;
                    this.updateGameDisplay();
                    this.addSystemLog('player', 'DOUBLE 1/2', `連続攻撃 1回目の判定完了。2回目のコールを入力してください。`);
                } else {
                    // 2回目終了 -> ターン交代
                    this.isDoubleMode = false;
                    this.doubleStep = 0;
                    this.updateGameDisplay();
                    this.addSystemLog('player', 'DOUBLE 2/2', `連続攻撃 2回目完了。ターン交代します。`);
                    
                    if (this.gameMode === 'vs') {
                        this.setTurn('cpu');
                    } else {
                        this.setTurn('player');
                    }
                }
            } else {
                // 通常モード -> ターン交代
                if (this.gameMode === 'vs') {
                    this.setTurn('cpu');
                } else {
                    this.setTurn('player');
                }
            }
        }, 300);
    }

    // ==========================================================================
    // CPUのターン実行 (アイテム使用 ＋ アタック)
    // ==========================================================================
    executeCpuTurn() {
        if (!this.gameActive || this.turn !== 'cpu') return;

        // CPUのアイテム使用判断
        const itemAction = this.decideCpuItemUse();

        if (itemAction) {
            // アイテム使用時は演出を挟んで実行
            setTimeout(() => {
                this.executeCpuItemUse(itemAction);
            }, 1000);
        } else {
            // アイテム不発なら即アタック
            this.executeCpuAttack();
        }
    }

    // CPUのアイテム使用意思決定
    decideCpuItemUse() {
        // すでにDOUBLEなどで連続コール処理中の場合はアイテム使用不可
        if (this.isDoubleMode) return null;

        // 1. 防御アイテムの使用判断 (プレイヤーの履歴が2E以上、または候補数がかなり絞られている危険な状況)
        if (!this.cpu.defUsed) {
            const playerLastLog = this.dom.playerLogList.querySelector('.log-item:last-child');
            let isDanger = false;
            if (playerLastLog) {
                // 前回のプレイヤー結果でEATが2、またはBITEが3
                const badges = playerLastLog.querySelectorAll('.badge');
                if (badges.length >= 2) {
                    const eat = parseInt(badges[0].textContent);
                    const bite = parseInt(badges[1].textContent);
                    if (eat >= 2 || (eat + bite) === 3) {
                        isDanger = true;
                    }
                }
            }

            if (isDanger || this.playerTurns >= 5) {
                return { type: 'def', item: this.cpu.defItem };
            }
        }

        // 2. 攻撃アイテムの使用判断 (序盤〜中盤で候補数がまだ多く、アイテムが未使用の場合)
        if (!this.cpu.atkUsed && this.cpuTurns >= 1 && this.cpu.candidates.length > 50) {
            return { type: 'atk', item: this.cpu.atkItem };
        }

        return null;
    }

    // CPUのアイテム使用実行
    executeCpuItemUse(action) {
        sounds.playItem();

        if (action.type === 'atk') {
            this.cpu.atkUsed = true;
            this.updateItemButtonsDisplay();

            if (action.item === 'double') {
                this.addSystemLog('cpu', 'DOUBLE', `CPUがDOUBLEを発動しました。`);
                // プレイヤーに開示桁を指定させる
                this.showPlayerDoubleCounterDialog();
            } else if (action.item === 'high-low') {
                // プレイヤーのHIGH&LOWを解析
                const hl = [];
                for (let i = 0; i < 3; i++) {
                    hl.push(parseInt(this.playerSecret[i]) >= 5 ? 'H' : 'L');
                }
                this.cpu.applyHighLow(hl);
                
                const labels = hl.map(v => v === 'H' ? 'HIGH' : 'LOW').join(', ');
                this.addSystemLog('cpu', 'HIGH & LOW', `プレイヤーの各桁属性 [${labels}] を捕捉。`);
                this.updateAiAnalysisPanel(this.cpu.candidates.length, `「HIGH&LOWデータを解析。候補を [${this.cpu.candidates.length}通り] に圧縮しました。」`);
                
                // アイテム使用後にアタック
                setTimeout(() => this.executeCpuAttack(), 1500);
            } else if (action.item === 'target') {
                // CPUは候補の絞り込みに最も有用な数字をターゲットにする (候補リストに最も多く出現する数字などを選ぶのが賢いが、簡易的にランダムまたは候補内の有力な数)
                // 候補リスト全体で、最も出現率の高い数字を1つ選ぶ
                const counts = Array(10).fill(0);
                this.cpu.candidates.forEach(c => {
                    c.split('').forEach(digit => {
                        counts[parseInt(digit)]++;
                    });
                });
                // 最大の出現数の数字（かつまだ確定していないもの）
                let targetDigit = '0';
                let maxCount = -1;
                for (let i = 0; i < 10; i++) {
                    if (counts[i] > maxCount) {
                        maxCount = counts[i];
                        targetDigit = i.toString();
                    }
                }

                const index = this.playerSecret.indexOf(targetDigit);
                this.cpu.applyTarget(targetDigit, index);

                const desc = index !== -1 ? `[${index+1}桁目] に含まれる` : '含まれない';
                this.addSystemLog('cpu', 'TARGET', `ターゲット [${targetDigit}] の探索結果：${desc}`);
                this.updateAiAnalysisPanel(this.cpu.candidates.length, `「TARGET [${targetDigit}] スキャン。候補を [${this.cpu.candidates.length}通り] に圧縮。」`);
                
                setTimeout(() => this.executeCpuAttack(), 1500);
            } else if (action.item === 'slash') {
                const nums = this.playerSecret.split('').map(Number);
                const slash = Math.max(...nums) - Math.min(...nums);
                this.cpu.applySlash(slash);

                this.addSystemLog('cpu', 'SLASH', `プレイヤーのSLASHナンバー [${slash}] を捕捉。`);
                this.updateAiAnalysisPanel(this.cpu.candidates.length, `「SLASH [${slash}] 特性を解析。候補を [${this.cpu.candidates.length}通り] に圧縮。」`);
                
                setTimeout(() => this.executeCpuAttack(), 1500);
            }
        } else {
            // 防御アイテム使用
            this.cpu.defUsed = true;
            this.updateItemButtonsDisplay();

            if (action.item === 'shuffle') {
                sounds.playShuffle();
                // CPUの秘密数字をシャッフル
                const arr = this.cpu.secret.split('');
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                this.cpu.secret = arr.join('');

                // プレイヤーのインテルメモをシャッフルに合わせてリセット (HIGH&LOWとターゲットの正確な位置情報を無効化、ただし含まれる情報は残す)
                this.intelHL = [null, null, null];
                this.intelTargets = this.intelTargets.map(t => ({ ...t, position: -1 }));
                this.updateIntelMemoDisplay();

                this.addSystemLog('cpu', 'SHUFFLE', `CPUがSHUFFLEを使用。自身の数字の配置を再編成しました。`);
                this.addSystemLog('player', 'SHUFFLE WARNING', `相手の配置が変わりました。インテルメモのEATおよび桁の位置情報が失われました。`);
                
                setTimeout(() => this.executeCpuAttack(), 1500);
            } else if (action.item === 'change') {
                sounds.playShuffle();
                // CPUが任意の1桁をチェンジ
                const pos = Math.floor(Math.random() * 3);
                const oldDigit = this.cpu.secret[pos];
                const isHigh = parseInt(oldDigit) >= 5;
                const allDigits = isHigh ? ['5', '6', '7', '8', '9'] : ['0', '1', '2', '3', '4'];
                
                const available = allDigits.filter(d => !this.cpu.secret.includes(d));
                const newDigit = available[Math.floor(Math.random() * available.length)];
                
                const arr = this.cpu.secret.split('');
                arr[pos] = newDigit;
                this.cpu.secret = arr.join('');

                // プレイヤーのインテルメモを修正 (チェンジされた位置のHIGH/LOW属性は確定)
                this.intelHL[pos] = isHigh ? 'H' : 'L';
                // ターゲットの位置情報もチェンジされた桁は失われる
                this.intelTargets = this.intelTargets.map(t => {
                    if (t.position === pos) {
                        return { ...t, position: -1 };
                    }
                    return t;
                });
                this.updateIntelMemoDisplay();

                this.addSystemLog('cpu', 'CHANGE', `CPUが [${pos+1}桁目] の数字をCHANGEしました (${isHigh ? 'HIGH' : 'LOW'})。`);
                
                setTimeout(() => this.executeCpuAttack(), 1500);
            }
        }
    }

    // CPUがDOUBLE使用時、プレイヤーに桁開示を指定させるダイアログを表示
    showPlayerDoubleCounterDialog() {
        this.showActionOverlay('CPU DOUBLE 被弾', 'CPUがDOUBLEを使用しました。代償として、CPUに開示させるあなたの桁を1つ選択してください。', false);

        const container = document.createElement('div');
        container.className = 'item-buttons-container';

        for (let i = 0; i < 3; i++) {
            const digit = this.playerSecret[i];
            const btn = document.createElement('button');
            btn.className = 'btn-item';
            btn.innerHTML = `
                <span class="item-name">${i+1}桁目</span>
                <span class="item-type-label">開示する</span>
            `;
            btn.addEventListener('click', () => {
                sounds.playClick();
                this.hideActionOverlay();
                
                // CPU AIに開示情報を適用
                this.cpu.applyDoubleReveal(digit, i);

                this.addSystemLog('player', 'DOUBLE EXPOSE', `CPUに [${i+1}桁目: ${digit}] を開示しました。`);
                this.addSystemLog('cpu', 'DOUBLE RESULT', `プレイヤーの [${i+1}桁目: ${digit}] をロック完了。2連続コールシーケンスへ移行。`);
                this.updateAiAnalysisPanel(this.cpu.candidates.length, `「開示情報 [${i+1}桁目: ${digit}] を適用。候補数を [${this.cpu.candidates.length}通り] に削減。」`);

                // 2回アタックを実行
                this.isDoubleMode = true;
                this.doubleStep = 1;
                setTimeout(() => this.executeCpuAttack(), 1000);
            });
            container.appendChild(btn);
        }
        this.dom.actionDialogContent.appendChild(container);
    }

    // CPUのアタック実体
    executeCpuAttack() {
        if (!this.gameActive || this.turn !== 'cpu') return;

        this.cpuTurns++;
        const guess = this.cpu.makeGuess();
        
        sounds.playAttack();

        const result = GameLogic.calculateEatBite(this.playerSecret, guess);
        this.addLogItem('cpu', this.cpuTurns, guess, result);

        // AIのフィードバック
        this.cpu.feedback(guess, result.eat, result.bite);

        let thought = '';
        if (result.eat === 3) {
            thought = `「完全解読に成功。答えは ${guess} です。」`;
        } else if (this.cpu.candidates.length <= 1) {
            thought = `「解析完了。標的のシグナルを残り1通りに特定しました。」`;
        } else if (this.cpu.candidates.length < 10) {
            thought = `「高精度特定モード。可能性は極めて低く、残り ${this.cpu.candidates.length} 通りです。」`;
        } else if (result.eat > 0 || result.bite > 0) {
            thought = `「${guess} に対し ${result.eat} EAT, ${result.bite} BITE を検知。ノイズを除去中。」`;
        } else {
            thought = `「ノーヒット判定。候補群から ${guess} に関連する数値を一括排除します。」`;
        }
        this.updateAiAnalysisPanel(this.cpu.candidates.length, thought);

        setTimeout(() => {
            if (result.eat === 3) {
                this.endGame('defeat');
                return;
            }

            if (result.eat > 0) {
                sounds.playEat();
            } else if (result.bite > 0) {
                sounds.playBite();
            } else {
                sounds.playOscillator([300], 'sine', 0.15);
            }

            // DOUBLE モードの連続攻撃制御 (CPU側)
            if (this.isDoubleMode) {
                if (this.doubleStep === 1) {
                    this.doubleStep = 2;
                    this.addSystemLog('cpu', 'DOUBLE 1/2', `CPU連続攻撃 1回目完了。続けて2回目を行います。`);
                    setTimeout(() => this.executeCpuAttack(), 1500);
                } else {
                    this.isDoubleMode = false;
                    this.doubleStep = 0;
                    this.addSystemLog('cpu', 'DOUBLE 2/2', `CPU連続攻撃 2回目完了。ターン交代します。`);
                    this.setTurn('player');
                }
            } else {
                this.setTurn('player');
            }
        }, 300);
    }

    // ==========================================================================
    // UI制御とインテルメモ表示
    // ==========================================================================
    
    // インテルメモ表示更新
    updateIntelMemoDisplay() {
        // 1. HIGH & LOW
        const hlSlots = this.dom.intelHlReveal.querySelectorAll('.hl-badge');
        for (let i = 0; i < 3; i++) {
            const val = this.intelHL[i];
            if (val === 'H') {
                hlSlots[i].textContent = 'HIGH';
                hlSlots[i].className = 'badge hl-badge high';
            } else if (val === 'L') {
                hlSlots[i].textContent = 'LOW';
                hlSlots[i].className = 'badge hl-badge low';
            } else {
                hlSlots[i].textContent = '-';
                hlSlots[i].className = 'badge hl-badge';
            }
        }

        // 2. SLASH
        if (this.intelSlash !== null) {
            this.dom.intelSlashVal.textContent = this.intelSlash;
            this.dom.intelSlashVal.classList.add('highlight');
        } else {
            this.dom.intelSlashVal.textContent = '-';
            this.dom.intelSlashVal.classList.remove('highlight');
        }

        // 3. TARGET
        this.dom.intelTargetList.innerHTML = '';
        if (this.intelTargets.length === 0) {
            const span = document.createElement('span');
            span.className = 'empty-intel';
            span.textContent = 'なし';
            this.dom.intelTargetList.appendChild(span);
        } else {
            this.intelTargets.forEach(t => {
                const badge = document.createElement('span');
                badge.className = 'badge target-badge';
                if (t.found) {
                    const posStr = t.position !== -1 ? `${t.position+1}桁目` : '位置不明';
                    badge.textContent = `[${t.digit}]: ${posStr}`;
                } else {
                    badge.textContent = `[${t.digit}]: なし`;
                    badge.style.borderColor = 'var(--color-accent)';
                    badge.style.color = 'var(--color-accent)';
                    badge.style.textShadow = 'var(--glow-accent)';
                }
                this.dom.intelTargetList.appendChild(badge);
            });
        }
    }

    // AI分析状況パネル更新
    updateAiAnalysisPanel(candidateCount, thoughtText) {
        this.dom.aiCandidateCount.textContent = candidateCount;
        const total = 720;
        const percentage = Math.round((candidateCount / total) * 100);
        this.dom.aiPercentage.textContent = `${percentage}%`;
        const progress = 100 - percentage;
        this.dom.aiProgressFill.style.width = `${progress}%`;
        this.dom.aiThoughtText.textContent = thoughtText;
    }

    // ログにアタック履歴を追加
    addLogItem(type, turn, guess, result) {
        const list = type === 'player' ? this.dom.playerLogList : this.dom.cpuLogList;
        const emptyMsg = list.querySelector('.empty-log');
        if (emptyMsg) emptyMsg.remove();

        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
            <span class="log-turn">T-${turn}</span>
            <span class="log-guess">${guess}</span>
            <div class="log-result">
                <span class="badge eat">${result.eat} EAT</span>
                <span class="badge bite">${result.bite} BITE</span>
            </div>
        `;
        list.appendChild(item);
        list.scrollTop = list.scrollHeight;
    }

    // ログにシステムイベントを追加
    addSystemLog(side, itemType, description) {
        const list = side === 'player' ? this.dom.playerLogList : this.dom.cpuLogList;
        const emptyMsg = list.querySelector('.empty-log');
        if (emptyMsg) emptyMsg.remove();

        const item = document.createElement('div');
        item.className = 'log-item system-log';
        item.innerHTML = `
            <strong>[${itemType}]</strong>
            <span class="sys-desc">${description}</span>
        `;
        list.appendChild(item);
        list.scrollTop = list.scrollHeight;
    }

    // アクションオーバーレイの表示制御
    showActionOverlay(title, desc, showCancel = true) {
        this.dom.actionDialogTitle.textContent = title;
        this.dom.actionDialogDesc.textContent = desc;
        this.dom.actionDialogContent.innerHTML = '';
        this.dom.actionCancelBtn.style.display = showCancel ? 'block' : 'none';
        this.dom.actionOverlay.style.display = 'flex';
    }

    hideActionOverlay() {
        this.dom.actionOverlay.style.display = 'none';
    }

    // 画面切り替えのユーティリティ
    showScreen(screenId) {
        const screens = [this.dom.setupScreen, this.dom.gameScreen, this.dom.resultScreen];
        screens.forEach(screen => {
            if (screen.id === screenId) {
                screen.style.display = 'block';
                setTimeout(() => screen.classList.add('active'), 50);
            } else {
                screen.classList.remove('active');
                screen.style.display = 'none';
            }
        });
    }

    showSetupScreen() {
        sounds.playClick();
        this.playerSetupDigits = [];
        this.updateSetupDisplay();
        this.showScreen('setup-screen');
    }

    endGame(outcome) {
        this.gameActive = false;
        
        const playTimeSec = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(playTimeSec / 60);
        const seconds = playTimeSec % 60;
        const timeStr = `${minutes}分${seconds}秒`;

        if (outcome === 'victory') {
            this.dom.resultScreen.querySelector('.result-panel').className = 'panel glass-panel result-panel victory';
            this.dom.resultTitle.textContent = 'VICTORY';
            this.dom.resultSubtitle.textContent = 'CPUの防御コードの完全解読に成功しました！';
            sounds.playWin();
        } else {
            this.dom.resultScreen.querySelector('.result-panel').className = 'panel glass-panel result-panel defeat';
            this.dom.resultTitle.textContent = 'DEFEAT';
            this.dom.resultSubtitle.textContent = 'CPUに先を越され、あなたの暗号は解読されました。';
            sounds.playLose();
        }

        this.dom.cpuSecretReveal.textContent = this.cpu.secret;
        if (this.gameMode === 'vs') {
            this.dom.playerSecretReveal.textContent = this.playerSecret;
            this.dom.playerSecretRevealBox.style.display = 'flex';
            this.dom.statTurns.textContent = `${this.playerTurns}手`;
        } else {
            this.dom.playerSecretRevealBox.style.display = 'none';
            this.dom.statTurns.textContent = `${this.playerTurns}手`;
        }
        this.dom.statTime.textContent = timeStr;

        this.showScreen('result-screen');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new Numer0nApp();
});
