// 설정 (/os/settings). 서버 껍데기 = package.json 의 버전만 읽어 넘긴다. 화면은 SettingsScreen(클라이언트).
import pkg from '../../../../package.json'
import SettingsScreen from './SettingsScreen'

export default function OsSettingsPage() {
    return <SettingsScreen version={String(pkg.version ?? '')} />
}
