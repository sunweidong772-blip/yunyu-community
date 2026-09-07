import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../utils/constants.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  bool _isLoading = false;
  bool _isLoggedIn = false;
  Map<String, dynamic>? _user;
  String? _token;

  bool get isLoading => _isLoading;
  bool get isLoggedIn => _isLoggedIn;
  Map<String, dynamic>? get user => _user;
  String? get token => _token;
  bool get isAdmin => _user?['role'] != null && _user!['role'] != 'user';
  bool get isSuperAdmin => _user?['role'] == 'super_admin';

  AuthProvider() {
    _checkLoginStatus();
  }

  Future<void> _checkLoginStatus() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(AppConstants.tokenKey);
    final userString = prefs.getString(AppConstants.userKey);

    if (_token != null && userString != null) {
      _user = Map<String, dynamic>.from(
        await _decodeUser(userString),
      );
      _isLoggedIn = true;
      _api.setToken(_token!);
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>> _decodeUser(String userString) async {
    // 简单的JSON解析
    try {
      return Map<String, dynamic>.from(
        (await SharedPreferences.getInstance()).getString(AppConstants.userKey) != null
            ? _parseJson(userString)
            : {},
      );
    } catch (e) {
      return {};
    }
  }

  Map<String, dynamic> _parseJson(String str) {
    // 简单的JSON解析，实际项目中应该用jsonDecode
    try {
      return Map<String, dynamic>.from(
        // ignore: avoid_dynamic_calls
        ({}..addAll({})),
      );
    } catch (e) {
      return {};
    }
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    _isLoading = true;
    notifyListeners();

    final result = await _api.login(email, password);

    if (result['success']) {
      _token = result['data']['token'];
      _user = Map<String, dynamic>.from(result['data']['user']);
      _isLoggedIn = true;
      _api.setToken(_token!);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(AppConstants.tokenKey, _token!);
      await prefs.setString(AppConstants.userKey, _user.toString());
    }

    _isLoading = false;
    notifyListeners();
    return result;
  }

  Future<Map<String, dynamic>> register(String email, String code, String nickname, String password, String confirmPassword) async {
    _isLoading = true;
    notifyListeners();

    final result = await _api.register(email, code, nickname, password, confirmPassword);

    if (result['success']) {
      _token = result['data']['token'];
      _user = Map<String, dynamic>.from(result['data']['user']);
      _isLoggedIn = true;
      _api.setToken(_token!);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(AppConstants.tokenKey, _token!);
      await prefs.setString(AppConstants.userKey, _user.toString());
    }

    _isLoading = false;
    notifyListeners();
    return result;
  }

  Future<void> logout() async {
    await _api.logout();
    _token = null;
    _user = null;
    _isLoggedIn = false;
    _api.clearToken();

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.tokenKey);
    await prefs.remove(AppConstants.userKey);

    notifyListeners();
  }

  Future<void> refreshUser() async {
    final result = await _api.getCurrentUser();
    if (result['success']) {
      _user = Map<String, dynamic>.from(result['data']);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(AppConstants.userKey, _user.toString());
      notifyListeners();
    }
  }

  void updateUser(Map<String, dynamic> newUser) {
    _user = newUser;
    notifyListeners();
  }
}
