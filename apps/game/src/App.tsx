import { useEffect, type ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Crosshair,
  Dumbbell,
  Euro,
  Home,
  Inbox,
  Search,
  Shirt,
  Stethoscope,
  Trophy,
  UserCog,
  Users,
  ChevronRight,
  Play,
  Flag,
} from "lucide-react";
import { addDays, daysBetween, formatDateFr, type World } from "@ovalie/engine";
import { game, useGame } from "./game/client";
import { clubAccent, dateShort } from "./game/format";
import { href, navigate, useRoute } from "./game/router";
import { isMatchToday, myClub, myNextFixture, teamName, unreadCount, viewOf, venueLetter, competitionShort } from "./game/selectors";
import { Button, ClubCrest } from "./ui/components";
import { TitleScreen } from "./screens/Title";
import { HomeScreen } from "./screens/Home";
import { InboxScreen } from "./screens/Inbox";
import { SquadScreen } from "./screens/Squad";
import { PlayerScreen } from "./screens/Player";
import { TacticsScreen } from "./screens/Tactics";
import { LineupScreen } from "./screens/Lineup";
import { PreparationScreen } from "./screens/Preparation";
import { MatchReportScreen } from "./screens/MatchReport";
import { CalendarScreen } from "./screens/Calendar";
import { CompetitionsScreen } from "./screens/Competitions";
import { ClubScreen } from "./screens/Club";
import { SeasonEndScreen } from "./screens/SeasonEnd";
import { LiveMatchScreen } from "./screens/LiveMatch";
import { TrainingScreen } from "./screens/Training";
import { MedicalScreen } from "./screens/Medical";
import { StaffScreen } from "./screens/Staff";
import { FinancesScreen } from "./screens/Finances";
import { RecruitmentScreen } from "./screens/Recruitment";

export function App() {
  const { world, busy, progressDate } = useGame();
  const accent = world?.manager ? myClub(world).colors : undefined;
  useEffect(() => {
    const { accent: a, ink } = clubAccent(accent);
    document.documentElement.style.setProperty("--accent", a);
    document.documentElement.style.setProperty("--accent-ink", ink);
  }, [accent?.[0], accent?.[1]]);

  if (!world?.manager) return <TitleScreen />;
  if (world.manager.dismissed) return <DismissedScreen world={world} />;
  return <Shell world={world} busy={busy} progressDate={progressDate} />;
}

function Shell({ world, busy, progressDate }: { world: World; busy: boolean; progressDate?: string }) {
  const { screen } = useRoute();
  // The live match takes the whole screen (no sidebar), like a TV broadcast.
  if (screen === "direct") return <LiveMatchScreen />;
  return (
    <div className="shell">
      <Sidebar world={world} />
      <TopBar world={world} busy={busy} />
      <main className="main">
        <div className="main__inner">
          <Screen />
        </div>
      </main>
      {busy && (
        <div className="overlay" role="status" aria-live="polite">
          <div className="overlay__card">
            <div className="spinner" />
            <div className="faint">Simulation en cours…</div>
            {progressDate && <div className="overlay__date">{formatDateFr(progressDate)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Screen() {
  const { screen, params } = useRoute();
  switch (screen) {
    case "boite":
      return <InboxScreen />;
    case "effectif":
      return <SquadScreen clubId={params[0]} />;
    case "joueur":
      return <PlayerScreen playerId={params[0] ?? ""} />;
    case "tactique":
      return <TacticsScreen />;
    case "composition":
      return <LineupScreen />;
    case "preparation":
      return <PreparationScreen />;
    case "match":
      return <MatchReportScreen fixtureId={params[0] ?? ""} />;
    case "calendrier":
      return <CalendarScreen />;
    case "competitions":
      return <CompetitionsScreen competitionId={params[0]} />;
    case "club":
      return <ClubScreen clubId={params[0]} />;
    case "bilan":
      return <SeasonEndScreen />;
    case "entrainement":
      return <TrainingScreen />;
    case "medical":
      return <MedicalScreen />;
    case "staff":
      return <StaffScreen />;
    case "recrutement":
      return <RecruitmentScreen />;
    case "finances":
      return <FinancesScreen />;
    default:
      return <HomeScreen />;
  }
}

interface NavDef {
  screen: string;
  label: string;
  icon: ReactNode;
  soon?: string;
}
const NAV: NavDef[] = [
  { screen: "accueil", label: "Accueil", icon: <Home size={18} /> },
  { screen: "boite", label: "Boîte de réception", icon: <Inbox size={18} /> },
  { screen: "effectif", label: "Effectif", icon: <Users size={18} /> },
  { screen: "tactique", label: "Tactique", icon: <ClipboardList size={18} /> },
  { screen: "composition", label: "Composition", icon: <Shirt size={18} /> },
  { screen: "preparation", label: "Préparation de match", icon: <Crosshair size={18} /> },
  { screen: "calendrier", label: "Calendrier", icon: <CalendarDays size={18} /> },
  { screen: "competitions", label: "Compétitions", icon: <Trophy size={18} /> },
  { screen: "club", label: "Club", icon: <Building2 size={18} /> },
  { screen: "entrainement", label: "Entraînement", icon: <Dumbbell size={18} /> },
  { screen: "medical", label: "Médical", icon: <Stethoscope size={18} /> },
  { screen: "staff", label: "Staff", icon: <UserCog size={18} /> },
  { screen: "recrutement", label: "Recrutement", icon: <Search size={18} /> },
  { screen: "finances", label: "Finances", icon: <Euro size={18} /> },
];
const NAV_LATER: NavDef[] = [

];

function Sidebar({ world }: { world: World }) {
  const { screen } = useRoute();
  const unread = unreadCount(world);
  const active = screen === "joueur" ? "effectif" : screen === "match" ? "calendrier" : screen;
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Flag size={20} color="var(--accent)" />
        <span>
          Ovalie <b>Manager</b>
        </span>
      </div>
      <nav className="sidebar__nav" aria-label="Navigation principale">
        {NAV.map((n) => (
          <a key={n.screen} href={href(n.screen)} className={`nav-item${active === n.screen ? " is-on" : ""}`} title={n.label} aria-current={active === n.screen ? "page" : undefined}>
            {n.icon}
            <span>{n.label}</span>
            {n.screen === "boite" && unread > 0 && <b className="nav-item__badge">{unread}</b>}
          </a>
        ))}
        <div className="sidebar__sep" />
        {NAV_LATER.map((n) => (
          <span key={n.screen} className="nav-item is-disabled" title={`${n.label} : arrive avec le management profond (${n.soon})`} aria-disabled>
            {n.icon}
            <span>{n.label}</span>
            <span className="nav-item__soon">{n.soon}</span>
          </span>
        ))}
      </nav>
      <div className="sidebar__foot">
        Saison {world.season.replace("-", "-")} ·{" "}
        <button className="btn btn--ghost btn--sm" onClick={() => game.quit()} style={{ padding: 0, height: "auto" }}>
          Menu principal
        </button>
      </div>
    </aside>
  );
}

function TopBar({ world, busy }: { world: World; busy: boolean }) {
  const club = myClub(world);
  const today = isMatchToday(world);
  const next = myNextFixture(world);
  const seasonOver = world.date > world.calendar.end;
  const nv = next && viewOf(world, next);

  const onContinue = async () => {
    if (seasonOver) return navigate("bilan");
    if (today) return navigate("preparation");
    const r = await game.continue();
    if (r.stop?.reason === "matchDay") navigate("preparation");
    else if (r.stop?.reason === "news") navigate("boite");
    else if (r.stop?.reason === "seasonEnd") navigate("bilan");
    else if (r.stop?.reason === "dismissed") navigate("accueil");
  };

  return (
    <header className="topbar">
      <a className="topbar__club" href={href("club")}>
        <ClubCrest colors={club.colors} label={club.shortName} size={34} />
        <div>
          <div className="topbar__club-name">{club.name}</div>
          <div className="topbar__manager">{world.manager!.profile.name}, manager</div>
        </div>
      </a>
      <div className="spacer" />
      {nv && !today && (
        <a className="topbar__next" href={href("preparation")} title="Préparer le prochain match">
          <span className="faint">Prochain match</span>{" "}
          <b>
            {dateShort(nv.fixture.date)} · {competitionShort(nv.fixture.competitionId)} · {teamName(world, nv.opponent)} ({venueLetter(nv)})
          </b>{" "}
          <span className="badge badge--outline">J-{daysBetween(world.date, nv.fixture.date)}</span>
        </a>
      )}
      <div className="topbar__date">
        <b>{formatDateFr(world.date)}</b>
        <span>{today ? "Jour de match" : seasonOver ? "Saison terminée" : `Saison ${world.season}`}</span>
      </div>
      <Button variant="primary" size="lg" onClick={onContinue} disabled={busy} icon={today ? <Play size={18} /> : <ChevronRight size={18} />}>
        <span className="btn-continue">{seasonOver ? "Bilan de saison" : today ? "Jour de match" : "Continuer"}</span>
      </Button>
    </header>
  );
}


/** The board has sacked the manager: the career is over (M6b). */
function DismissedScreen({ world }: { world: World }) {
  const m = world.manager!;
  const club = world.clubs[m.clubId]!;
  return (
    <div className="dismissed">
      <div className="modal-card">
        <ClubCrest colors={club.colors} label={club.shortName} size={56} />
        <div className="modal-card__kicker">{formatDateFr(m.dismissed!.date)}</div>
        <h1 className="display" style={{ margin: 0 }}>Vous êtes démis de vos fonctions</h1>
        <p className="muted">{m.dismissed!.reason}</p>
        <p className="faint">
          Bilan : réputation {Math.round(m.reputation ?? 50)}/100. Une nouvelle carrière vous attend peut-être ailleurs.
        </p>
        <Button variant="primary" size="lg" onClick={() => game.quit()}>
          Menu principal
        </Button>
      </div>
    </div>
  );
}
