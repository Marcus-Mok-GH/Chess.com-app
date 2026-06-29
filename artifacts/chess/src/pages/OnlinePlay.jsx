import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import OnlineChessGame from '../components/OnlineChessGame';
import { useSettings } from '../contexts/SettingsContext';
import { playMatchFoundSound } from '../utils/sound';
import LoginModal from '../components/LoginModal';
import { useUser } from '../contexts/UserContext';
import socketService from '../services/socket';
import pollingService from '../services/matchmakingPolling';
import api from '../services/api';

import { useMatchmaking } from './OnlinePlay/hooks/useMatchmaking';
import LobbyUI from './OnlinePlay/subcomponents/LobbyUI';
import './OnlinePlay.css';

export default function OnlinePlay() {
  const [searchParams] = useSearchParams();
  const { gameId: routeGameId } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { user, isLoggedIn } = useUser();
  const isGuest = !isLoggedIn;

  const [view, setView] = useState('mode-select');
  const [gameMode, setGameMode] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [joinCode, setJoinCode] = throw 'Content too large for preview';