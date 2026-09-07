import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/constants.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String? _token;

  Future<void> _initToken() async {
    if (_token == null) {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString(AppConstants.tokenKey);
    }
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<Map<String, dynamic>> _request(
    String method,
    String endpoint, {
    Map<String, dynamic>? body,
    Map<String, String>? queryParams,
  }) async {
    await _initToken();

    var uri = Uri.parse('${AppConstants.apiBaseUrl}$endpoint');
    if (queryParams != null) {
      uri = uri.replace(queryParameters: queryParams);
    }

    http.Response response;
    try {
      switch (method) {
        case 'GET':
          response = await http.get(uri, headers: _headers).timeout(const Duration(seconds: 15));
          break;
        case 'POST':
          response = await http.post(uri, headers: _headers, body: jsonEncode(body ?? {})).timeout(const Duration(seconds: 15));
          break;
        case 'PUT':
          response = await http.put(uri, headers: _headers, body: jsonEncode(body ?? {})).timeout(const Duration(seconds: 15));
          break;
        case 'DELETE':
          response = await http.delete(uri, headers: _headers).timeout(const Duration(seconds: 15));
          break;
        default:
          throw Exception('不支持的请求方法');
      }

      final data = jsonDecode(response.body);
      if (response.statusCode == 200 && data['code'] == 200) {
        return {'success': true, 'data': data['data'], 'message': data['message']};
      } else {
        return {'success': false, 'message': data['message'] ?? '请求失败', 'code': data['code']};
      }
    } catch (e) {
      return {'success': false, 'message': '网络连接失败，请检查网络'};
    }
  }

  // 认证相关
  Future<Map<String, dynamic>> sendCode(String email, String type) =>
      _request('POST', '/auth/send-code', body: {'email': email, 'type': type});

  Future<Map<String, dynamic>> verifyCode(String email, String code, String type) =>
      _request('POST', '/auth/verify-code', body: {'email': email, 'code': code, 'type': type});

  Future<Map<String, dynamic>> register(String email, String code, String nickname, String password, String confirmPassword) =>
      _request('POST', '/auth/register', body: {
        'email': email,
        'code': code,
        'nickname': nickname,
        'password': password,
        'confirmPassword': confirmPassword,
      });

  Future<Map<String, dynamic>> login(String email, String password) =>
      _request('POST', '/auth/login', body: {'email': email, 'password': password});

  Future<Map<String, dynamic>> resetPassword(String email, String code, String newPassword, String confirmPassword) =>
      _request('POST', '/auth/reset-password', body: {
        'email': email,
        'code': code,
        'newPassword': newPassword,
        'confirmPassword': confirmPassword,
      });

  Future<Map<String, dynamic>> changePassword(String oldPassword, String newPassword, String confirmPassword) =>
      _request('POST', '/auth/change-password', body: {
        'oldPassword': oldPassword,
        'newPassword': newPassword,
        'confirmPassword': confirmPassword,
      });

  Future<Map<String, dynamic>> getCurrentUser() => _request('GET', '/auth/me');

  Future<Map<String, dynamic>> logout() => _request('POST', '/auth/logout');

  // 用户相关
  Future<Map<String, dynamic>> getUserProfile(String id) => _request('GET', '/users/$id');

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) =>
      _request('PUT', '/users/profile', body: data);

  Future<Map<String, dynamic>> followUser(String id) => _request('POST', '/users/$id/follow');

  Future<Map<String, dynamic>> checkin() => _request('POST', '/users/checkin');

  Future<Map<String, dynamic>> getCheckinRecords(String month) =>
      _request('GET', '/users/checkin/records', queryParams: {'month': month});

  Future<Map<String, dynamic>> getDailyTasks() => _request('GET', '/users/tasks/daily');

  // 帖子相关
  Future<Map<String, dynamic>> getPosts({int page = 1, int limit = 20, String? category, String? sort}) =>
      _request('GET', '/posts', queryParams: {
        'page': page.toString(),
        'limit': limit.toString(),
        if (category != null) 'category': category,
        if (sort != null) 'sort': sort,
      });

  Future<Map<String, dynamic>> getPostDetail(String id) => _request('GET', '/posts/$id');

  Future<Map<String, dynamic>> createPost(Map<String, dynamic> data) =>
      _request('POST', '/posts', body: data);

  Future<Map<String, dynamic>> likePost(String id) => _request('POST', '/posts/$id/like');

  Future<Map<String, dynamic>> favoritePost(String id) => _request('POST', '/posts/$id/favorite');

  Future<Map<String, dynamic>> getComments(String postId, {int page = 1}) =>
      _request('GET', '/posts/$postId/comments', queryParams: {'page': page.toString()});

  Future<Map<String, dynamic>> addComment(String postId, String content, {int? parentId, int? replyToUserId}) =>
      _request('POST', '/posts/$postId/comments', body: {
        'content': content,
        if (parentId != null) 'parent_id': parentId,
        if (replyToUserId != null) 'reply_to_user_id': replyToUserId,
      });

  Future<Map<String, dynamic>> search(String keyword) =>
      _request('GET', '/posts/search/all', queryParams: {'keyword': keyword});

  // 软件相关
  Future<Map<String, dynamic>> getSoftwares({int page = 1, int limit = 20, String? category, String? sort}) =>
      _request('GET', '/softwares', queryParams: {
        'page': page.toString(),
        'limit': limit.toString(),
        if (category != null) 'category': category,
        if (sort != null) 'sort': sort,
      });

  Future<Map<String, dynamic>> getSoftwareDetail(String id) => _request('GET', '/softwares/$id');

  Future<Map<String, dynamic>> downloadSoftware(String id) => _request('POST', '/softwares/$id/download');

  Future<Map<String, dynamic>> favoriteSoftware(String id) => _request('POST', '/softwares/$id/favorite');

  Future<Map<String, dynamic>> getSoftwareCategories() => _request('GET', '/softwares/categories/list');

  Future<Map<String, dynamic>> getSoftwareCollections() => _request('GET', '/softwares/collections/list');

  Future<Map<String, dynamic>> getHomeRecommended() => _request('GET', '/softwares/home/recommended');

  // 消息相关
  Future<Map<String, dynamic>> getMessages({int page = 1, String? type}) =>
      _request('GET', '/messages', queryParams: {
        'page': page.toString(),
        if (type != null) 'type': type,
      });

  Future<Map<String, dynamic>> markMessageRead(String id) => _request('POST', '/messages/$id/read');

  Future<Map<String, dynamic>> markAllRead() => _request('POST', '/messages/read-all');

  Future<Map<String, dynamic>> getUnreadCount() => _request('GET', '/messages/unread/count');

  Future<Map<String, dynamic>> getConversations() => _request('GET', '/messages/private/conversations');

  Future<Map<String, dynamic>> getPrivateMessages(String userId) =>
      _request('GET', '/messages/private/$userId');

  Future<Map<String, dynamic>> sendPrivateMessage(String userId, String content) =>
      _request('POST', '/messages/private/$userId', body: {'content': content});

  Future<Map<String, dynamic>> report(Map<String, dynamic> data) =>
      _request('POST', '/messages/report', body: data);

  Future<Map<String, dynamic>> getAnnouncements() => _request('GET', '/messages/announcements/list');

  // 管理员相关
  Future<Map<String, dynamic>> getAdminDashboard() => _request('GET', '/admin/dashboard');

  Future<Map<String, dynamic>> getAdminUsers({int page = 1, String? keyword}) =>
      _request('GET', '/admin/users', queryParams: {
        'page': page.toString(),
        if (keyword != null) 'keyword': keyword,
      });

  Future<Map<String, dynamic>> updateUserLevel(String id, int level, int exp) =>
      _request('PUT', '/admin/users/$id/level', body: {'level': level, 'exp': exp});

  Future<Map<String, dynamic>> muteUser(String id, bool muted) =>
      _request('PUT', '/admin/users/$id/mute', body: {'muted': muted});

  Future<Map<String, dynamic>> banUser(String id, bool banned) =>
      _request('PUT', '/admin/users/$id/ban', body: {'banned': banned});

  Future<Map<String, dynamic>> getAdminPosts({int page = 1}) =>
      _request('GET', '/admin/posts', queryParams: {'page': page.toString()});

  Future<Map<String, dynamic>> updatePost(String id, Map<String, dynamic> data) =>
      _request('PUT', '/admin/posts/$id', body: data);

  Future<Map<String, dynamic>> deletePost(String id) => _request('DELETE', '/admin/posts/$id');

  Future<Map<String, dynamic>> getReports({int page = 1, String? status}) =>
      _request('GET', '/admin/reports', queryParams: {
        'page': page.toString(),
        if (status != null) 'status': status,
      });

  Future<Map<String, dynamic>> handleReport(String id, String status, String result) =>
      _request('PUT', '/admin/reports/$id', body: {'status': status, 'handle_result': result});

  Future<Map<String, dynamic>> getTopics() => _request('GET', '/posts/topics/list');

  void setToken(String token) {
    _token = token;
  }

  void clearToken() {
    _token = null;
  }
}
