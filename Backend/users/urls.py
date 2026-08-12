from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    # Auth endpoints
    path('register/', views.RegisterView.as_view(), name='register'),
    path('register/brand/', views.BrandRegisterView.as_view(), name='register_brand'),
    path('verify-email/send/', views.send_verification_code_view, name='send_verification_code'),
    path('verify-email/resend/', views.resend_verification_code_view, name='resend_verification_code'),
    path('verify-email/confirm/', views.verify_email_view, name='verify_email'),
    path('forgot-password/request/', views.forgot_password_request_view, name='forgot_password_request'),
    path('forgot-password/confirm/', views.forgot_password_confirm_view, name='forgot_password_confirm'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Customer profile
    path('profile/', views.profile_view, name='profile'),
    path('profile/update/', views.update_profile_view, name='update_profile'),
    
    # Brand profile
    path('brand/profile/', views.brand_profile_view, name='brand_profile'),
    path('brand/profile/update/', views.update_brand_profile_view, name='update_brand_profile'),
    
    # Product CRUD
    path('products/', views.product_list_view, name='product_list'),
    path('products/create/', views.product_create_view, name='product_create'),
    path('products/<int:product_id>/', views.product_detail_view, name='product_detail'),
    path('products/<int:product_id>/update/', views.product_update_view, name='product_update'),
    path('products/<int:product_id>/delete/', views.product_delete_view, name='product_delete'),
    
    # Product images
    path('products/images/<int:image_id>/delete/', views.product_image_delete_view, name='product_image_delete'),
    
    # Brand's products (public)
    path('brands/<int:brand_id>/products/', views.brand_products_view, name='brand_products'),
    
    # Wishlist endpoints
    path('wishlist/', views.wishlist_list_view, name='wishlist_list'),
    path('wishlist/add/', views.wishlist_add_view, name='wishlist_add'),
    path('wishlist/remove/<int:product_id>/', views.wishlist_remove_view, name='wishlist_remove'),
    
    # Cart endpoints
    path('cart/', views.cart_list_view, name='cart_list'),
    path('cart/add/', views.cart_add_view, name='cart_add'),
    path('cart/update/<int:item_id>/', views.cart_update_view, name='cart_update'),
    path('cart/remove/<int:item_id>/', views.cart_remove_view, name='cart_remove'),
    path('cart/clear/', views.cart_clear_view, name='cart_clear'),
    
    # Review endpoints
    path('products/<int:product_id>/reviews/', views.product_reviews_view, name='product_reviews'),
    path('reviews/create/', views.review_create_view, name='review_create'),
    path('reviews/<int:review_id>/delete/', views.review_delete_view, name='review_delete'),
    path('reviews/my/', views.user_reviews_view, name='user_reviews'),

    # Messaging endpoints
    path('products/<int:product_id>/messages/', views.product_messages_view, name='product_messages'),
    path('messages/send/', views.send_message_view, name='send_message'),
    path('messages/send-to-brand/', views.send_message_to_brand_view, name='send_message_to_brand'),
    path('messages/conversations/', views.conversations_list_view, name='conversations_list'),

    # Notifications
    path('notifications/', views.notifications_list_view, name='notifications_list'),
    path('notifications/unread-count/', views.notifications_unread_count_view, name='notifications_unread_count'),
    path('notifications/read-all/', views.notifications_mark_all_read_view, name='notifications_read_all'),
    path('notifications/<int:notification_id>/read/', views.notification_mark_read_view, name='notification_mark_read'),

    # Address endpoints
    path('addresses/', views.address_list_view, name='address_list'),
    path('addresses/create/', views.address_create_view, name='address_create'),
    path('addresses/<int:address_id>/', views.address_detail_view, name='address_detail'),

    # Change password
    path('profile/change-password/', views.change_password_view, name='change_password'),
    path('brand/change-password/', views.change_brand_password_view, name='change_brand_password'),

    # Brand analytics
    path('brand/analytics/', views.brand_analytics_view, name='brand_analytics'),

    # Checkout & Orders (customer)
    path('checkout/', views.checkout_view, name='checkout'),
    path('checkout/guest/', views.guest_checkout_view, name='guest_checkout'),
    path('payment/ssl/success/', views.ssl_payment_success_view, name='ssl_payment_success'),
    path('payment/ssl/fail/', views.ssl_payment_fail_view, name='ssl_payment_fail'),
    path('payment/ssl/cancel/', views.ssl_payment_cancel_view, name='ssl_payment_cancel'),
    path('payment/ssl/ipn/', views.ssl_payment_ipn_view, name='ssl_payment_ipn'),
    path('payment/mock/success/', views.mock_payment_success_view, name='mock_payment_success'),
    path('orders/', views.order_list_view, name='order_list'),
    path('orders/<int:order_id>/', views.order_detail_view, name='order_detail'),
    path('orders/guest/<int:order_id>/', views.guest_order_detail_view, name='guest_order_detail'),
    path('orders/<int:order_id>/cancel/', views.order_cancel_view, name='order_cancel'),

    # Orders (brand)
    path('brand/orders/', views.brand_orders_view, name='brand_orders'),
    path('brand/orders/<int:order_id>/', views.brand_order_detail_view, name='brand_order_detail'),
    path('brand/orders/<int:order_id>/status/', views.brand_order_status_update_view, name='brand_order_status'),

    # AI URL endpoint proxy
    path('get-ai-url/', views.get_ai_url, name='get_ai_url'),
    # Health check
    path('health/', views.health, name='health'),
]
