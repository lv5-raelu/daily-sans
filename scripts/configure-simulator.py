#!/usr/bin/env python3
"""Produce the Normal-only event graph from the pinned Construct 2 export."""
import hashlib
import json
import copy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/vendor/c2-sans-fight'
MODES = {'MODE_NORMAL': 0, 'MODE_ENDLESS': 1, 'MODE_SINGLE': 2, 'MODE_PRACTICE': 3,
         'SimulatorMode': 0}
REMOVED = set(MODES) | {'EndlessStage', 'PracticeTarget', 'SingleAttack'}
LOADING_LABEL_ACTIONS = {866871016798015, 3276516335364258}
VISUAL_ACTIONS = {
    # The bridge samples the original motion paths at the display refresh rate.
    7588369545806161, 180131503971844, 7059030601907315, 4394562403147867, 4897453954417372,
    3066819403009204, 207833805975499, 8334525037545989,
    2468856873844738, 4506271606700868, 1795519733392314, 3770458388429609,
    # The original blue/yellow eye alternates every two native frames.
    3406173047554672, 7033184958983622,
}


def condition_value(c):
    if c[0] != -1 or len(c) < 10:
        return None
    p = c[9]
    if not p or p[0] != [11, 'SimulatorMode']:
        return None
    other = p[2][1]
    rhs = MODES.get(other[1]) if other[0] == 23 else other[1]
    if rhs is None:
        raise ValueError('Unknown mode condition')
    return [0 == rhs, 0 != rhs, 0 < rhs, 0 <= rhs, 0 > rhs, 0 >= rhs][p[1][1]]


def always(value, sid):
    return [-1, 39, None, 0, False, False, False, sid, False,
            [[7, [0, 0]], [8, 0], [7, [0, 0 if value else 1]]]]


def events(rows):
    result = []
    for ev in rows:
        if ev[0] == 1 and ev[1] in REMOVED:
            continue
        if ev[0] != 0:
            result.append(ev)
            continue
        if isinstance(ev[1], list) and ev[1][1] == 'PracticeMode':
            continue
        if any(len(a) > 5 and a[0] == 3 and a[1] == 20 and a[5]
               and a[5][0] == [1, [2, 'SetPracticeAttack']] for a in ev[6]):
            ev[6] = []
            if len(ev) > 7:
                ev[7] = []
        # Preserve false placeholders so an adjacent Else retains its meaning.
        for i, c in enumerate(ev[5]):
            value = condition_value(c)
            if value is not None:
                ev[5][i] = always(value, c[7])
                if not value and not ev[2]:
                    ev[6] = []
                    if len(ev) > 7:
                        ev[7] = []
        ev[6] = [a for a in ev[6] if a[3] not in VISUAL_ACTIONS and not
                 (len(a) > 5 and a[0] == -1 and a[1] == 65
                  and a[5] == [[6, 'MainMenu']])]
        if len(ev) > 7:
            ev[7] = events(ev[7])
        for action in ev[6]:
            if action[3] in LOADING_LABEL_ACTIONS:
                action[5] = [[7, [2, '']]]
        # The native writer keeps its bubble for the entire conversation. Create
        # and position it only on the first page; later pages replace just the font.
        if any(a[3] == 5140099445205868 for a in ev[6]) and any(
                c[0] == 3 and len(c) > 9 and c[9] == [[1, [2, 'SansText']]] for c in ev[5]):
            original = ev[6]
            nested = ev[7] if len(ev) > 7 else []
            count = [-1, 39, None, 0, False, False, False, 1000000000201, False,
                     [[7, [20, 28, 51, False, None]], [8, 0], [7, [0, 0]]]]
            first = [0, None, False, None, 1000000000200, [count], original, nested]
            reused = copy.deepcopy([a for a in original if a[3] not in
                                    {5140099445205868, 5215295811409118, 521153523069346}])
            reused_nested = copy.deepcopy(nested)
            fresh = iter(range(1000000000500, 1000000000700))
            for a in reused:
                a[3] = next(fresh)
            def freshen(items):
                for e in items:
                    e[4] = next(fresh)
                    for c in e[5]:
                        c[7] = next(fresh)
                    for a in e[6]:
                        a[3] = next(fresh)
                    if len(e) > 7:
                        freshen(e[7])
            freshen(reused_nested)
            otherwise = [-1, 43, None, 0, False, False, False, 1000000000203, False]
            second = [0, None, False, None, 1000000000202, [otherwise], reused, reused_nested]
            ev[6] = []
            ev[7:] = [[first, second]]
        result.append(ev)
    return result


def replace_constants(x):
    if isinstance(x, list):
        if len(x) == 2 and x[0] == 23 and isinstance(x[1], str) and x[1] in MODES:
            return [0, MODES[x[1]]]
        return [replace_constants(v) for v in x]
    return x


def main():
    path = DEST / 'data.js'
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    project = data['project']
    project[1] = 'BattleScreen'
    project[5] = [layout for layout in project[5] if layout[0] != 'MainMenu']
    project[6] = [[sh[0], events(sh[1])] for sh in project[6] if sh[0] != 'MainMenu']
    # Remove the dormant guest-pattern update hook from the active fight.
    battle = next(sheet[1] for sheet in project[6] if sheet[0] == 'Battle')
    battle[:] = [event for event in battle if not (event[0] == 0 and event[4] == 1000000000800)]
    # Native intro: three normal pages, black flash, visible soul + eyeless face,
    # then the silent threat. Keep the first attack and every later attack intact.
    intro = DEST / 'sans_intro.csv'
    rows = intro.read_text().splitlines()
    attack_start = next(i for i, row in enumerate(rows) if row.startswith('0,SansBody,HandDown,'))
    prefix = [
        ['0', 'SansAnimation'], ['0', 'SansHead', 'ClosedEyes'],
        ['0', 'SansText', 'ready?'],
        # ResizeInstant also makes the border visible on the Overlay layer.
        # Prepare it before BlackScreen hides it, all within the same tick.
        ['0.3333333333', 'CombatZoneResizeInstant', '239', '226', '404', '391'],
        ['0', 'HeartTeleport', '320', '304'], ['0', 'HeartMode', '0'],
        ['0', 'BlackScreen', '1'], ['0', 'Sound', 'Flash'],
        ['0.2666666667', 'BlackScreen', '0'], ['0', 'Sound', 'Flash'],
        ['0', 'SansHead', 'NoEyes'],
        ['0.6666666667', 'SansText', '__daily_opening_threat__'],
    ]
    intro.write_bytes(('\r\n'.join([','.join(row + [''] * (11 - len(row))) for row in prefix] + rows[attack_start:]) + '\r\n').encode())
    bubble = project[3][28][7]
    bubble[:] = [animation for animation in bubble if animation[0] != 'DailyThreat']
    small = ROOT / 'public/daily-assets/bubble-small.png'
    bubble.append(['DailyThreat', 5, False, 1, 0, False, 1000000000001,
                   [['../../daily-assets/bubble-small.png', small.stat().st_size,
                     0, 0, 105, 108, 1, 0, 0, [], [], 3]]])
    animation = json.loads((ROOT / 'src/daily/animation-data.json').read_text())
    for definition in project[3][24][7]:
        gesture = animation['gestures'][definition[0]]
        sprite = animation['sprites'][gesture['sprite']]
        width, height = sprite['width'], sprite['height']
        definition[7] = [
            [sprite['frames'][frame]['url'], sprite['frames'][frame]['bytes'],
             0, 0, width, height, 1,
             gesture['anchor'][0] / width, gesture['anchor'][1] / height,
             [['Head', head[0] / width, head[1] / height]], [], 3]
            for frame, head in zip(gesture['frames'], gesture['head'])]
    def resize_body_instances(node):
        if not isinstance(node, list):
            return
        if len(node) > 1 and node[1] == 24 and isinstance(node[0], list) and len(node[0]) >= 10:
            geometry = node[0]
            geometry[3:5] = [128, 146]
            geometry[8:10] = [30 / 64, 70 / 73]
        for child in node:
            resize_body_instances(child)
    resize_body_instances(project[5])
    for definition in project[3][25][7]:
        sitting = definition[0] == 'Sitting'
        sprite = animation['sprites']['spr_sansb_legs_sit' if sitting else 'spr_sansb_legs']
        width, height = sprite['width'], sprite['height']
        definition[7] = [[sprite['frames'][0]['url'], sprite['frames'][0]['bytes'],
                          0, 0, width, height, 1, sprite['origin'][0] / width,
                          15 / height if sitting else 1,
                          [['Torso', sprite['origin'][0] / width, 2 / height if sitting else 0]], [], 3]]
    eye = next(a for a in project[3][23][7] if a[0] == 'BlueEye')
    eye[1], eye[2] = 15, True
    data = replace_constants(data) if isinstance(data, list) else {'project': replace_constants(project)}
    encoded = json.dumps(data, separators=(',', ':')).encode()
    assert not any(name.encode() in encoded for name in REMOVED)
    assert b'MainMenu' not in encoded and b'PracticeMode' not in encoded
    assert b'LOADING ATTACKS' not in encoded
    path.write_bytes(encoded)
    obsolete = ['index.html', 'player.html', 'sw.js', 'offline.js', 'offlineClient.js', 'appmanifest.json']
    for name in obsolete:
        (DEST / name).unlink(missing_ok=True)
    report = {'revision': 'a1732fcddc0487e47ec8d903bcb0049a627e69c7',
              'changes': ['Normal mode starts directly in BattleScreen',
                          'MainMenu layout and event sheet removed',
                          'Other mode branches and variables removed',
                          'Internal returns to MainMenu removed; the daily app owns retries',
                          'Opening flash and silent threat ordered from the native game event',
                          'Original small speech bubble added as DailyThreat animation',
                          'Original complete gesture sequences, head offsets and sitting alignment restored',
                          'Native bobbing replaces upstream approximations; blue eye alternates at 15 fps',
                          'One speech bubble persists across a conversation; loading labels are blank',
                          'Guest projectile update runs on the native paused simulation clock',
                          'Offline cache and upstream HTML launchers removed'],
              'removedFiles': obsolete,
              'dataSha256': hashlib.sha256(encoded).hexdigest(),
              'introSha256': hashlib.sha256(intro.read_bytes()).hexdigest()}
    (ROOT / 'reference/simulator-customization.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Configured Normal-only simulator and original opening transition; combat timelines unchanged.')


if __name__ == '__main__':
    main()
